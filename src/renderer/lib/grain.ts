/** The most opaque the frame's grain gets, at full strength. */
const MAX_ALPHA = 0.24;

const cache = new Map<number, string>();

/**
 * A tile of fractal noise for the window frame, like Arc's grain: grey
 * specks at `amount` (0–1) of full strength, or `none` for no grain.
 */
export function grainImage(amount: number): string {
  const alpha =
    Math.round(Math.min(1, Math.max(0, amount)) * MAX_ALPHA * 1000) / 1000;
  if (alpha === 0) return 'none';
  let image = cache.get(alpha);
  if (!image) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    cache.set(alpha, image);
  }
  return image;
}
