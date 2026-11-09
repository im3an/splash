/**
 * Colour in OKLCH (Björn Ottosson's OKLab, in polar form): lightness 0–1,
 * chroma, hue in degrees. Equal steps look equal, so lightness can be fixed
 * per scheme and the hue left alone, which plain RGB or HSL mixing can't do.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: readonly number[]) =>
  rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001);

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((i) =>
    toLinear(parseInt(hex.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: L,
    c: Math.hypot(A, B),
    h: normalizeHue((Math.atan2(B, A) * 180) / Math.PI),
  };
}

/** The most chroma a lightness and hue can have on an sRGB screen. */
export function maxChroma(l: number, h: number): number {
  let low = 0;
  let high = 0.4;
  for (let step = 0; step < 14; step++) {
    const middle = (low + high) / 2;
    if (inGamut(oklchToLinear({ l, c: middle, h }))) low = middle;
    else high = middle;
  }
  return low;
}

/** A colour as `#rrggbb`, its chroma cut back to fit the screen if need be. */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(Math.max(0, color.c), maxChroma(l, color.h));
  return `#${oklchToLinear({ l, c, h: color.h })
    .map((channel) =>
      Math.round(255 * toGamma(Math.min(1, Math.max(0, channel))))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The way round from one hue to another that's shorter, in degrees. */
export function hueDistance(from: number, to: number): number {
  return normalizeHue(to - from + 180) - 180;
}

/**
 * A place on the colour canvas: `hue` is the angle from the centre, clockwise
 * from the top, and `radius` 0–1 is how vivid it is, from grey at the
 * centre to the most vivid the screen can show at that hue on the rim.
 */
export interface CanvasPoint {
  hue: number;
  radius: number;
}

/** The lightness the canvas shows its colours at. */
export const CANVAS_LIGHTNESS = 0.74;

export function pointToHex({ hue, radius }: CanvasPoint): string {
  const c = Math.min(1, Math.max(0, radius)) * maxChroma(CANVAS_LIGHTNESS, hue);
  return oklchToHex({ l: CANVAS_LIGHTNESS, c, h: hue });
}

/** Where a colour sits on the canvas; its lightness is set aside. */
export function hexToPoint(hex: string): CanvasPoint {
  const { c, h } = hexToOklch(hex);
  const rim = maxChroma(CANVAS_LIGHTNESS, h);
  return { hue: h, radius: rim ? Math.min(1, c / rim) : 0 };
}
