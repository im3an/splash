/** Chromium's zoom presets, in percent. */
export const ZOOM_LEVELS = [
  25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500,
] as const;

/** The next preset in `direction` from `current` (which may sit between presets). */
export function stepZoom(current: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    return ZOOM_LEVELS.find((level) => level > current + 0.5) ?? 500;
  }
  return (
    [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.5) ?? 25
  );
}
