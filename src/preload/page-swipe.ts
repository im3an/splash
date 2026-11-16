import {
  GESTURE_GAP_MS,
  SwipeTracker,
  type SwipeKind,
  type SwipeState,
  type WheelSample,
} from './swipe-gesture';
import type { SwipeAnswer, SwipeColors } from '../shared/page-bridge';

/*
 * The page half of trackpad swipes: reads wheel events the page left alone,
 * shows the swipe as it happens, and asks the main process to go back,
 * forward or reload once it fills. The effect lives in a closed shadow root,
 * only while a swipe is showing.
 */

/** How long the landing plays before the page goes. */
const LANDING_MS = 170;

export interface SwipeBridge {
  /** Which swipes would do something on this page right now. */
  available(): Promise<SwipeAnswer>;
  run(kind: SwipeKind): void;
}

export function installPageSwipe(bridge: SwipeBridge): void {
  const tracker = new SwipeTracker();
  const effect = new SwipeEffect();
  let allowed: Promise<SwipeAnswer> | null = null;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  window.addEventListener(
    'wheel',
    (event) => {
      // Pinch-to-zoom arrives as wheel events with ⌃ held.
      if (!event.isTrusted || event.ctrlKey || event.deltaMode !== 0) return;
      if (tracker.endedBy(event.timeStamp)) allowed = null;
      if (event.defaultPrevented) {
        tracker.cancel();
        effect.release();
        return;
      }
      const sample: WheelSample = {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        time: event.timeStamp,
        atEdge: edgesUnder(event),
      };
      const { state, done } = tracker.feed(sample);
      if (!state) return;
      allowed ??= bridge.available();
      const shown = state;
      void allowed.then((ok) => {
        if (!ok[shown.kind]) return;
        effect.paint(ok.colors);
        if (done) {
          effect.commit(done);
          // Going back is often instant, from the page cache: let the
          // landing be seen before this page is gone.
          setTimeout(() => bridge.run(done), LANDING_MS);
        } else effect.follow(shown);
      });
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => effect.release(), GESTURE_GAP_MS);
    },
    { passive: true },
  );
}

/** What can still scroll under the pointer, the page itself included. */
function edgesUnder(event: WheelEvent): WheelSample['atEdge'] {
  let left = true;
  let right = true;
  let top = true;
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node === document.documentElement || node === document.body) continue;
    const style = getComputedStyle(node);
    if (scrolls(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
      const max = node.scrollWidth - node.clientWidth;
      // Right-to-left boxes count scrollLeft from 0 down to -max.
      const fromStart =
        style.direction === 'rtl' ? max + node.scrollLeft : node.scrollLeft;
      if (fromStart > 1) left = false;
      if (fromStart < max - 1) right = false;
    }
    if (scrolls(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      if (node.scrollTop > 1) top = false;
    }
  }
  const page = document.scrollingElement ?? document.documentElement;
  const pageMax = page.scrollWidth - window.innerWidth;
  if (pageMax > 1) {
    const fromStart =
      getComputedStyle(page).direction === 'rtl'
        ? pageMax + window.scrollX
        : window.scrollX;
    if (fromStart > 1) left = false;
    if (fromStart < pageMax - 1) right = false;
  }
  if (window.scrollY > 1) top = false;
  return { left, right, top };
}

function scrolls(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

/**
 * Splash's Fluent System icons (src/renderer/icons), copied in because the
 * page preload can't load the app's icon module. Drawn on Fluent's 20-unit
 * grid with the same-colour outline that gives them their weight.
 */
const ICONS: Record<SwipeKind, string> = {
  back: '<path d="M9.16 16.87a.5.5 0 1 0 .67-.74L3.67 10.5H17.5a.5.5 0 0 0 0-1H3.67l6.16-5.63a.5.5 0 0 0-.67-.74L2.24 9.44a.75.75 0 0 0 0 1.11l6.92 6.32Z" />',
  forward:
    '<path d="M10.84 3.13a.5.5 0 0 0-.68.74l6.17 5.63H2.5a.5.5 0 0 0 0 1h13.83l-6.17 5.63a.5.5 0 0 0 .68.74l6.91-6.32a.75.75 0 0 0 0-1.1l-6.91-6.32Z" />',
  reload:
    '<path d="M4 10a6 6 0 0 1 10.47-4H12.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-1 0v1.6a7 7 0 1 0 1.98 4.36.5.5 0 1 0-1 .08L16 10a6 6 0 0 1-12 0Z" />',
};

/*
 * A soft light gathers at the page's edge, the edge itself goes out of focus,
 * and a glass disc rides in on a spring: it stretches with the fingers' speed
 * and wobbles as it settles. When the swipe lands, the disc fills, gives a
 * small shake and sends out a pulse. Everything is drawn from two numbers,
 * `--p` (how far the swipe is, sprung) and `--s` (the stretch), so a frame
 * costs one style write.
 */
const STYLE = `
  /* The workspace's colours arrive as --accent-light/-dark and --glow-1..3. */
  .fx {
    --accent: var(--accent-light, #4f8cff);
    --on-accent: #fff;
    --glow-a: var(--glow-1, var(--accent));
    --glow-b: var(--glow-2, var(--glow-a));
  }
  .fx { position: fixed; inset: 0; overflow: hidden; --p: 0; --s: 1; }
  .veil, .glow, .disc { position: absolute; will-change: transform, opacity; }

  .veil {
    opacity: var(--p);
    -webkit-backdrop-filter: blur(calc(var(--p) * 7px)) saturate(calc(1 + var(--p) * 0.3));
    backdrop-filter: blur(calc(var(--p) * 7px)) saturate(calc(1 + var(--p) * 0.3));
  }
  .glow {
    border-radius: 50%;
    background: radial-gradient(closest-side,
      color-mix(in oklab, var(--glow-a) 62%, transparent),
      color-mix(in oklab, var(--glow-b) 26%, transparent) 55%, transparent);
    filter: blur(22px);
    opacity: calc(var(--p) * 0.85);
  }
  .disc { width: 38px; height: 38px; }
  .ring, .body { position: absolute; inset: 0; border-radius: 50%; }
  .ring { border: 1.5px solid var(--accent); opacity: 0; }
  .body {
    display: grid; place-items: center; overflow: hidden;
    color: #1d1d1f;
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    backdrop-filter: blur(16px) saturate(1.6);
    box-shadow:
      inset 0 0.5px 0 rgba(255, 255, 255, 0.9),
      0 0 0 0.5px rgba(0, 0, 0, 0.1),
      0 6px 18px rgba(0, 0, 0, 0.16),
      0 0 calc(var(--p) * 22px) color-mix(in oklab, var(--accent) calc(var(--p) * 45%), transparent);
  }
  .fill {
    position: absolute; inset: 0;
    background: radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--accent) 62%, white), var(--accent) 70%);
    opacity: clamp(0, calc((var(--p) - 0.72) * 3.6), 1);
  }
  svg { position: relative; transition: color 120ms ease-out; }
  .fx.near svg { color: var(--on-accent); }

  /* Left and right edges. */
  .back .veil, .forward .veil { top: 0; bottom: 0; width: 84px; }
  .back .veil { left: 0; -webkit-mask-image: linear-gradient(to right, #000, transparent); }
  .forward .veil { right: 0; -webkit-mask-image: linear-gradient(to left, #000, transparent); }
  .back .glow, .forward .glow { top: 50%; width: 200px; height: min(72vh, 560px); }
  .back .glow { left: 0; transform-origin: left center;
    transform: translate(-50%, -50%) scale(calc(0.4 + var(--p) * 0.6), calc(0.7 + var(--p) * 0.3)); }
  .forward .glow { right: 0; transform-origin: right center;
    transform: translate(50%, -50%) scale(calc(0.4 + var(--p) * 0.6), calc(0.7 + var(--p) * 0.3)); }
  .back .disc { left: 0; top: 50%;
    transform: translate(calc(var(--p) * 66px - 46px), -50%) scale(var(--s), calc(2 - var(--s))); }
  .forward .disc { right: 0; top: 50%;
    transform: translate(calc(46px - var(--p) * 66px), -50%) scale(var(--s), calc(2 - var(--s))); }

  /* The top edge, for reload. */
  .reload .veil { left: 0; right: 0; top: 0; height: 84px;
    -webkit-mask-image: linear-gradient(to bottom, #000, transparent); }
  .reload .glow { left: 50%; top: 0; width: min(72vw, 640px); height: 200px; transform-origin: center top;
    transform: translate(-50%, -50%) scale(calc(0.7 + var(--p) * 0.3), calc(0.4 + var(--p) * 0.6)); }
  .reload .disc { top: 0; left: 50%;
    transform: translate(-50%, calc(var(--p) * 66px - 46px)) scale(calc(2 - var(--s)), var(--s)); }
  .reload:not(.go) svg { transform: rotate(calc(var(--p) * 300deg)); }

  /* Landing: a shake, a pulse, a brighter glow, then away. */
  .go .body { animation: wiggle 340ms cubic-bezier(0.3, 0.7, 0.4, 1); }
  .go .ring { animation: pulse 420ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
  .go .glow { animation: flare 420ms ease-out forwards; }
  .reload.go svg { animation: spin 420ms cubic-bezier(0.3, 0.7, 0.3, 1); }
  .fx { transition: opacity 220ms ease-out; }
  .fx.gone { opacity: 0; }

  @keyframes wiggle {
    0% { transform: scale(1); }
    25% { transform: scale(1.14) rotate(-9deg); }
    50% { transform: scale(1.06) rotate(6deg); }
    75% { transform: scale(1.02) rotate(-2.5deg); }
    100% { transform: scale(1) rotate(0); }
  }
  @keyframes pulse {
    0% { opacity: 0.7; transform: scale(1); }
    100% { opacity: 0; transform: scale(2.7); border-width: 0.5px; }
  }
  @keyframes flare {
    0% { opacity: 0.85; filter: blur(22px); }
    35% { opacity: 1; filter: blur(30px); }
    100% { opacity: 0.5; filter: blur(34px); }
  }
  @keyframes spin { from { transform: rotate(300deg); } to { transform: rotate(660deg); } }

  @media (prefers-color-scheme: dark) {
    /* Dark accents are light, so the arrow on them goes dark. */
    .fx { --accent: var(--accent-dark, #5b94ff); --on-accent: #17171a; }
    .body {
      color: #f5f5f7;
      background: rgba(40, 40, 44, 0.66);
      box-shadow:
        inset 0 0.5px 0 rgba(255, 255, 255, 0.18),
        0 0 0 0.5px rgba(255, 255, 255, 0.12),
        0 6px 18px rgba(0, 0, 0, 0.45),
        0 0 calc(var(--p) * 26px) color-mix(in oklab, var(--accent) calc(var(--p) * 50%), transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .go .body, .go .ring, .go .glow, .reload.go svg { animation: none; }
    .veil { display: none; }
  }
`;

/** Only plain colours reach the style sheet. */
const HEX = /^#[0-9a-f]{6}$/i;

/** Spring constants: a little under critical damping, for one soft wobble. */
const STIFFNESS = 260;
const DAMPING = 22;

class SwipeEffect {
  private host: HTMLElement | null = null;
  private fx: HTMLElement | null = null;
  private kind: SwipeKind | null = null;
  /** Where the swipe really is, and the sprung value drawn. */
  private target = 0;
  private shown = 0;
  private velocity = 0;
  private frame = 0;
  private lastFrame = 0;
  private lastInput = 0;
  /** Following the fingers directly, or springing on its own. */
  private mode: 'fingers' | 'spring' = 'spring';
  private leaving: ReturnType<typeof setTimeout> | undefined;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)');

  private colors: SwipeColors | null = null;

  /** Draws in the page's workspace colours; null keeps the default blue. */
  paint(colors: SwipeColors | null): void {
    this.colors = colors;
    if (this.fx) this.applyColors(this.fx);
  }

  private applyColors(fx: HTMLElement): void {
    const colors = this.colors;
    const set = (name: string, value: string | undefined) =>
      value && HEX.test(value)
        ? fx.style.setProperty(name, value)
        : fx.style.removeProperty(name);
    set('--accent-light', colors?.accent.light);
    set('--accent-dark', colors?.accent.dark);
    for (let i = 0; i < 3; i++) set(`--glow-${i + 1}`, colors?.glow?.[i]);
  }

  /**
   * While the fingers are on the trackpad the disc sits exactly where they
   * put it, drawn at once, with no easing to lag behind. Only what the
   * fingers can't drive, letting go and landing, is sprung.
   */
  follow({ kind, progress }: SwipeState): void {
    const fx = this.mount(kind);
    const now = performance.now();
    if (this.mode === 'fingers') {
      const dt = Math.min(0.1, Math.max(0.004, (now - this.lastInput) / 1000));
      // Wheel events come unevenly; average the speed so the stretch doesn't flicker.
      this.velocity =
        this.velocity * 0.55 + ((progress - this.shown) / dt) * 0.45;
    } else {
      this.mode = 'fingers';
    }
    this.lastInput = now;
    this.target = progress;
    this.shown = progress;
    this.draw(fx);
    this.animate();
  }

  /** The swipe landed: fill, shake, pulse, then fade. */
  commit(kind: SwipeKind): void {
    const fx = this.mount(kind);
    this.mode = 'spring';
    this.target = 1;
    fx.classList.add('go', 'near');
    this.draw(fx);
    this.animate();
    this.leaving = setTimeout(() => this.unmount(), 480);
  }

  /** Fingers lifted short of the mark: spring back out of sight. */
  release(): void {
    if (!this.fx || this.fx.classList.contains('go')) return;
    this.mode = 'spring';
    this.target = 0;
    this.animate();
  }

  private draw(fx: HTMLElement): void {
    // Stretch along the swipe with speed; the spring's wobble shows here.
    const stretch = this.still.matches
      ? 1
      : 1 + Math.max(-0.12, Math.min(0.18, this.velocity * 0.03));
    fx.style.setProperty('--p', Math.max(0, this.shown).toFixed(4));
    fx.style.setProperty('--s', stretch.toFixed(4));
    fx.classList.toggle(
      'near',
      this.shown > 0.86 || fx.classList.contains('go'),
    );
  }

  private animate(): void {
    if (this.frame) return;
    this.lastFrame = performance.now();
    const step = (now: number) => {
      this.frame = 0;
      const fx = this.fx;
      if (!fx) return;
      const dt = Math.min(0.032, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      let moving: boolean;
      if (this.mode === 'fingers') {
        // Fingers resting: the stretch eases out; the place stays put.
        this.velocity *= Math.exp(-dt * 14);
        moving = Math.abs(this.velocity) > 0.01;
      } else if (this.still.matches) {
        this.shown = this.target;
        this.velocity = 0;
        moving = false;
      } else {
        const force =
          STIFFNESS * (this.target - this.shown) - DAMPING * this.velocity;
        this.velocity += force * dt;
        this.shown += this.velocity * dt;
        moving =
          Math.abs(this.target - this.shown) > 0.002 ||
          Math.abs(this.velocity) > 0.02;
      }
      this.draw(fx);
      if (!moving && this.mode === 'spring' && this.target === 0) {
        this.unmount();
        return;
      }
      if (moving) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private mount(kind: SwipeKind): HTMLElement {
    if (this.fx && this.host?.isConnected) {
      if (this.kind !== kind) this.setKind(kind);
      return this.fx;
    }
    clearTimeout(this.leaving);
    const host = document.createElement('div');
    host.setAttribute(
      'style',
      'all:initial!important;position:fixed!important;inset:0!important;' +
        'pointer-events:none!important;z-index:2147483647!important;' +
        'contain:strict!important',
    );
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML =
      `<style>${STYLE}</style>` +
      '<div class="fx"><div class="veil"></div><div class="glow"></div>' +
      '<div class="disc"><div class="ring"></div><div class="body">' +
      '<div class="fill"></div><span class="icon"></span></div></div></div>';
    document.documentElement.append(host);
    this.host = host;
    this.fx = root.querySelector<HTMLElement>('.fx')!;
    this.shown = 0;
    this.velocity = 0;
    this.mode = 'spring';
    this.applyColors(this.fx);
    this.setKind(kind);
    return this.fx;
  }

  private setKind(kind: SwipeKind): void {
    const fx = this.fx!;
    this.kind = kind;
    fx.classList.remove('back', 'forward', 'reload');
    fx.classList.add(kind);
    fx.querySelector('.icon')!.outerHTML =
      `<svg class="icon" viewBox="0 0 20 20" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round">${ICONS[kind]}</svg>`;
  }

  private unmount(): void {
    const host = this.host;
    const fx = this.fx;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.host = null;
    this.fx = null;
    this.kind = null;
    this.target = 0;
    if (!host || !fx) return;
    fx.classList.add('gone');
    setTimeout(() => host.remove(), 220);
  }
}
