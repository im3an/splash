import { hexToOklch, maxChroma, oklchToHex } from './color';

/** A site's colour, toned so it reads as text on either theme's field. */
export interface SiteAccent {
  light: string;
  dark: string;
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

const HUE_BUCKETS = 24;
/** Below this chroma a pixel counts as grey: outlines, shadows, white. */
const VIVID = 0.07;
/** Less of the icon than this isn't enough to call the site's colour. */
const MIN_VIVID_SHARE = 0.08;

/**
 * The colour an icon is mostly made of: its strongest band of hue, ignoring
 * transparent and grey pixels. `null` for a black, white or grey icon, so a
 * monochrome site isn't given a colour it doesn't have. `pixels` is RGBA or
 * BGRA, as `order` says.
 */
export function dominantColor(
  pixels: Uint8Array | Uint8ClampedArray,
  order: 'rgba' | 'bgra' = 'rgba',
): string | null {
  const [red, blue] = order === 'rgba' ? [0, 2] : [2, 0];
  const buckets = new Map<
    number,
    { weight: number; r: number; g: number; b: number }
  >();
  let opaque = 0;
  let vivid = 0;
  for (let at = 0; at + 3 < pixels.length; at += 4) {
    if (pixels[at + 3]! < 128) continue;
    opaque++;
    const r = pixels[at + red]!;
    const g = pixels[at + 1]!;
    const b = pixels[at + blue]!;
    const { c, h } = hexToOklch(`#${hex(r)}${hex(g)}${hex(b)}`);
    if (c < VIVID) continue;
    vivid++;
    const key = Math.floor((h / 360) * HUE_BUCKETS) % HUE_BUCKETS;
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += c;
    bucket.r += r * c;
    bucket.g += g * c;
    bucket.b += b * c;
    buckets.set(key, bucket);
  }
  if (opaque === 0 || vivid / opaque < MIN_VIVID_SHARE) return null;
  const best = [...buckets.values()].reduce((a, b) =>
    b.weight > a.weight ? b : a,
  );
  return `#${hex(best.r / best.weight)}${hex(best.g / best.weight)}${hex(best.b / best.weight)}`;
}

/** A colour moved just far enough in lightness to read on each theme. */
export function accentTones(color: string): SiteAccent {
  const { l, c, h } = hexToOklch(color);
  const toned = (lightness: number) =>
    oklchToHex({
      l: lightness,
      c: Math.min(c, maxChroma(lightness, h)),
      h,
    });
  return {
    light: toned(Math.min(l, 0.5)),
    dark: toned(Math.max(l, 0.74)),
  };
}
