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
  let animation: Animation | null = null;
  let timer = 0;

  const stop = () => {
    window.clearTimeout(timer);
    animation?.cancel();
    animation = null;
    if (title) delete title.dataset.marquee;
    title = null;
  };

  const start = (next: HTMLElement) => {
    // Reduced motion sets the motion tokens to zero.
    if (durationMs('--duration-fast') === 0) return;
    const shift = next.scrollWidth - next.clientWidth;
    if (shift < 2) return;
    const travel = (shift / SPEED) * 1000;
    const total = 2 * (travel + HOLD_MS);
    const hold = HOLD_MS / total;
    const end = `${-shift}px`;
    next.dataset.marquee = 'true';
    animation = next.animate(
      [
        { textIndent: '0px', offset: 0 },
        { textIndent: '0px', offset: hold, easing: 'ease-in-out' },
        { textIndent: end, offset: 0.5 },
        { textIndent: end, offset: 0.5 + hold, easing: 'ease-in-out' },
        { textIndent: '0px', offset: 1 },
      ],
      { duration: total, iterations: Infinity },
    );
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
