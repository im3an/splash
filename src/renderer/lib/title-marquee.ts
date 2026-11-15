import { durationMs } from './motion';

/** How long the pointer rests on a row before its title starts moving. */
const DELAY_MS = 450;
/** Reading speed, in pixels a second. */
const SPEED = 32;
/** The pause at each end, so the start and the end can both be read. */
const HOLD_MS = 1100;

/**
 * Hovering a row whose title is cut off scrolls the title to its end and
 * back, like a song title in Apple Music. One listener on the sidebar covers
 * every row, so no row re-renders for it. Off under reduced motion.
 */
export function installTitleMarquee(root: HTMLElement): () => void {
  let title: HTMLElement | null = null;
  let animations: Animation[] = [];
  let timer = 0;

  const stop = () => {
    window.clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    animations = [];
    if (title) delete title.dataset.marquee;
    title = null;
  };

  const start = (next: HTMLElement) => {
    // Reduced motion sets the motion tokens to zero.
    if (durationMs('--duration-fast') === 0) return;
    const text = next.querySelector<HTMLElement>('.trail-title-text');
    if (!text) return;
    const shift = next.scrollWidth - next.clientWidth;
    if (shift < 2) return;
    const travel = (shift / SPEED) * 1000;
    const total = 2 * (travel + HOLD_MS);
    const hold = HOLD_MS / total;
    const timing = { duration: total, iterations: Infinity };
    // Rest, scroll to the end, rest, scroll back.
    const offsets = [0, hold, 0.5, 0.5 + hold, 1];
    const easing = ['linear', 'ease-in-out', 'linear', 'ease-in-out', 'linear'];
    const end = `translateX(${-shift}px)`;
    const moves = ['none', 'none', end, end, 'none'];
    // The left fade comes in as the start of the title leaves.
    const edges = ['1', '1', '0', '0', '1'];
    next.dataset.marquee = 'true';
    // Moved by transform, not text-indent: Chromium doesn't repaint
    // text-indent under the title's edge mask, so the text looked stuck.
    animations = [
      text.animate(
        offsets.map((offset, i) => ({
          offset,
          easing: easing[i],
          transform: moves[i],
        })),
        timing,
      ),
      next.animate(
        offsets.map((offset, i) => ({
          offset,
          easing: easing[i],
          '--marquee-edge': edges[i],
        })),
        timing,
      ),
    ];
  };

  const over = (event: PointerEvent) => {
    const row = (event.target as Element | null)?.closest?.('.trail-row');
    const next = row?.querySelector<HTMLElement>('.trail-title') ?? null;
    if (next === title) return;
    stop();
    if (!next) return;
    title = next;
    timer = window.setTimeout(() => start(next), DELAY_MS);
  };

  root.addEventListener('pointerover', over);
  root.addEventListener('pointerleave', stop);
  return () => {
    stop();
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerleave', stop);
  };
}
