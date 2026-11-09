/**
 * The colour canvas's geometry, like Arc's picker: hue runs clockwise from
 * the top, vividness from grey at the centre to the most vivid the screen
 * can show at the rim. The colours themselves come from src/shared/color.ts.
 */
import { normalizeHue, type CanvasPoint } from '../../shared/color';

export { hexToPoint, normalizeHue, pointToHex } from '../../shared/color';
export type WheelPoint = CanvasPoint;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The wheel point under an offset from the wheel's centre. */
export function offsetToPoint(dx: number, dy: number, size: number) {
  return {
    hue: normalizeHue((Math.atan2(dx, -dy) * 180) / Math.PI),
    radius: clamp(Math.hypot(dx, dy) / (size / 2), 0, 1),
  };
}

/** The offset from the wheel's centre at which a point is drawn. */
export function pointToOffset({ hue, radius }: WheelPoint, size: number) {
  const angle = (hue * Math.PI) / 180;
  const distance = (radius * size) / 2;
  return { x: Math.sin(angle) * distance, y: -Math.cos(angle) * distance };
}

/**
 * The colours that go with a point: one at `+spread`, then one at `-spread`,
 * at the same lightness.
 */
export function harmonies(
  point: WheelPoint,
  count: number,
  spread: number,
): WheelPoint[] {
  return [spread, -spread]
    .slice(0, count)
    .map((offset) => ({ ...point, hue: normalizeHue(point.hue + offset) }));
}

export const SPREAD = { min: 12, max: 120, initial: 32 } as const;

/** The spread a dragged harmony asks for: its angle from the main colour. */
export function spreadBetween(main: number, other: number): number {
  const difference = Math.abs(normalizeHue(other - main + 180) - 180);
  return clamp(Math.round(difference), SPREAD.min, SPREAD.max);
}
