/**
 * The accent wheel's geometry, like Arc's colour picker: hue runs clockwise
 * from the top, lightness from dark at the centre to light at the rim.
 * Saturation is fixed so every point is a usable accent.
 */

export const WHEEL_SATURATION = 70;
export const WHEEL_LIGHTNESS = { centre: 22, rim: 72 } as const;

/** A point on the wheel: hue in degrees, distance from the centre 0–1. */
export interface WheelPoint {
  hue: number;
  radius: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + normalizeHue(hue) / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function hexToHsl(hex: string): {
  hue: number;
  saturation: number;
  lightness: number;
} {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness: lightness * 100 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return {
    hue: normalizeHue(hue * 60),
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

export function pointToHex({ hue, radius }: WheelPoint): string {
  const { centre, rim } = WHEEL_LIGHTNESS;
  return hslToHex(hue, WHEEL_SATURATION, centre + (rim - centre) * radius);
}

/** Where a colour sits on the wheel; lightness outside the range clamps. */
export function hexToPoint(hex: string): WheelPoint {
  const { hue, lightness } = hexToHsl(hex);
  const { centre, rim } = WHEEL_LIGHTNESS;
  return { hue, radius: clamp((lightness - centre) / (rim - centre), 0, 1) };
}

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

export function parseHex(input: string): string | null {
  const value = input.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value))
    return `#${Array.from(value.slice(1), (c) => c + c).join('')}`;
  return null;
}
