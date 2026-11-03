import {
  hexToOklch,
  hueDistance,
  maxChroma,
  normalizeHue,
  type Oklch,
  oklchToHex,
  pointToHex,
} from './color';
import type { WorkspaceAppearance } from './types';

/**
 * Workspace appearance presets. The shell turns them into design tokens;
 * the main process reads frame colours for the window background, so the
 * defaults here must match `tokens.css`.
 */

export interface AccentPreset {
  id: string;
  label: string;
  light: string;
  dark: string;
}

export const ACCENTS: readonly AccentPreset[] = [
  { id: 'ember', label: 'Ember', light: '#b4542d', dark: '#e3906a' },
  { id: 'amber', label: 'Amber', light: '#a06a0b', dark: '#e6b04f' },
  { id: 'moss', label: 'Moss', light: '#4c7a37', dark: '#93c279' },
  { id: 'teal', label: 'Teal', light: '#1d7770', dark: '#5ec3b6' },
  { id: 'sky', label: 'Sky', light: '#2d6cb0', dark: '#7eafea' },
  { id: 'iris', label: 'Iris', light: '#6450c2', dark: '#a99aef' },
  { id: 'rose', label: 'Rose', light: '#b1395f', dark: '#ec89aa' },
  { id: 'graphite', label: 'Graphite', light: '#4a4a50', dark: '#b9b9c0' },
];

export interface FramePreset {
  id: string;
  label: string;
  light: { chrome: string; surface: string; elevated: string; ink: string };
  dark: { chrome: string; surface: string; elevated: string; ink: string };
}

/**
 * The window frame around pages; `ink` tints hovers and dividers (r g b).
 * Dark frames are warm-leaning charcoals so text stays at fixed contrast.
 */
export const FRAMES: readonly FramePreset[] = [
  {
    id: 'paper',
    label: 'Paper',
    light: {
      chrome: '#f3efe9',
      surface: '#faf8f5',
      elevated: '#ffffff',
      ink: '70 52 32',
    },
    dark: {
      chrome: '#1a1714',
      surface: '#201c18',
      elevated: '#2a2520',
      ink: '240 228 214',
    },
  },
  {
    id: 'stone',
    label: 'Stone',
    light: {
      chrome: '#ededec',
      surface: '#f8f8f7',
      elevated: '#ffffff',
      ink: '44 44 48',
    },
    dark: {
      chrome: '#191817',
      surface: '#1f1e1c',
      elevated: '#292826',
      ink: '234 230 224',
    },
  },
  {
    id: 'sage',
    label: 'Sage',
    light: {
      chrome: '#e7ede3',
      surface: '#f5f8f3',
      elevated: '#ffffff',
      ink: '42 62 38',
    },
    dark: {
      chrome: '#161a15',
      surface: '#1c211b',
      elevated: '#262c24',
      ink: '226 236 222',
    },
  },
  {
    id: 'mist',
    label: 'Mist',
    light: {
      chrome: '#e6ecf3',
      surface: '#f4f7fa',
      elevated: '#ffffff',
      ink: '36 52 78',
    },
    dark: {
      chrome: '#15191e',
      surface: '#1b2026',
      elevated: '#252b32',
      ink: '222 230 240',
    },
  },
  {
    id: 'lilac',
    label: 'Lilac',
    light: {
      chrome: '#ede8f3',
      surface: '#f8f6fa',
      elevated: '#ffffff',
      ink: '62 44 86',
    },
    dark: {
      chrome: '#1a171f',
      surface: '#201c26',
      elevated: '#2a2531',
      ink: '232 226 240',
    },
  },
  {
    id: 'blush',
    label: 'Blush',
    light: {
      chrome: '#f4e9e7',
      surface: '#fbf6f5',
      elevated: '#ffffff',
      ink: '88 44 40',
    },
    dark: {
      chrome: '#1d1716',
      surface: '#241d1c',
      elevated: '#2f2725',
      ink: '240 226 224',
    },
  },
];

/**
 * A theme preset: up to three places on the colour canvas, the same dots
 * the picker shows, turned into a gradient by `themeStops`.
 */
export interface ThemePreset {
  id: string;
  label: string;
  colors: readonly string[];
}

const theme = (id: string, label: string, ...points: [number, number][]) => ({
  id,
  label,
  colors: points.map(([hue, radius]) => pointToHex({ hue, radius })),
});

/**
 * The picker's presets, a page of nine at a time. Hues are OKLCH angles:
 * red 25, orange 55, yellow 95, green 145, teal 185, blue 255, violet 300,
 * pink 350. The first eight keep the ids of the gradients they replace, so
 * workspaces saved with those still find them.
 */
export const THEMES: readonly ThemePreset[] = [
  theme('dusk', 'Dusk', [350, 0.7], [300, 0.7], [262, 0.7]),
  theme('ember', 'Ember', [50, 0.9], [25, 0.8], [345, 0.6]),
  theme('meadow', 'Meadow', [140, 0.6], [170, 0.55], [215, 0.5]),
  theme('lagoon', 'Lagoon', [195, 0.7], [250, 0.65], [290, 0.5]),
  theme('aurora', 'Aurora', [160, 0.7], [250, 0.6], [310, 0.6]),
  theme('bloom', 'Bloom', [355, 0.6], [60, 0.6], [95, 0.55]),
  theme('sand', 'Sand', [80, 0.3], [55, 0.3], [30, 0.2]),
  theme('graphite', 'Graphite', [260, 0.06]),
  theme('citrus', 'Citrus', [120, 0.85], [95, 0.8], [145, 0.6]),
  theme('ocean', 'Ocean', [245, 0.8]),
  theme('grape', 'Grape', [305, 0.8], [280, 0.7]),
  theme('coral', 'Coral', [30, 0.7], [0, 0.6]),
  theme('forest', 'Forest', [150, 0.7]),
  theme('rose', 'Rose', [355, 0.7]),
  theme('mint', 'Mint', [175, 0.6], [150, 0.5]),
  theme('cosmic', 'Cosmic', [275, 0.8], [330, 0.8], [240, 0.7]),
  theme('peach', 'Peach', [60, 0.5], [10, 0.45]),
];

export function themePreset(id: string | null | undefined): ThemePreset | null {
  return THEMES.find((preset) => preset.id === id) ?? null;
}

/** The colours a workspace paints its frame with: its own or a preset's. */
export function appearanceColors(
  appearance: Pick<WorkspaceAppearance, 'gradient' | 'colors'>,
): readonly string[] | null {
  if (appearance.colors?.length) return appearance.colors;
  return themePreset(appearance.gradient)?.colors ?? null;
}

/** The intensity a workspace has unless it sets one. */
export const INTENSITY = 0.5;
/** The grain a gradient has unless it sets some. A plain frame has none. */
export const GRAIN = 0.375;

export function appearanceGrain(appearance: WorkspaceAppearance): number {
  return appearance.grain ?? (appearanceColors(appearance) ? GRAIN : 0);
}

/**
 * Three stops from one to three colours, in the order the frame lays them
 * out: the lit corner (top left), the middle, the far corner.
 *
 * One colour gets companions the way a painter shades: a little warmer
 * towards the light, a little cooler into the shadow, so it still moves.
 * Two meet along the hue circle at full chroma, so the middle never goes
 * grey the way an RGB mix does.
 */
function stopsOf(colors: readonly string[]): [Oklch, Oklch, Oklch] {
  const [a, b, c] = colors.map(hexToOklch) as [Oklch, Oklch?, Oklch?];
  if (!b) {
    return [
      { ...a, h: towards(a.h, WARM, 22) },
      a,
      { ...a, h: towards(a.h, COOL, 26) },
    ];
  }
  if (!c) {
    const middle = {
      l: (a.l + b.l) / 2,
      c: Math.max((a.c + b.c) / 2, 0.9 * Math.max(a.c, b.c)),
      h: normalizeHue(a.h + hueDistance(a.h, b.h) / 2),
    };
    return [a, middle, b];
  }
  return [a, b, c];
}

/** Light leans warm and shadow cool, as in a painting. */
const WARM = 70;
const COOL = 255;

function towards(hue: number, target: number, degrees: number): number {
  const distance = hueDistance(hue, target);
  return normalizeHue(
    hue + Math.sign(distance) * Math.min(Math.abs(distance), degrees),
  );
}

/**
 * Each scheme fixes lightness and lets intensity drive chroma, so a stop
 * keeps the hue it was picked at while text keeps its contrast: pastel in
 * light, deep in dark. The lit corner is a touch lighter and the far one a
 * touch deeper.
 */
const TONE = {
  light: { lightness: [0.965, 0.95, 0.93], drop: 0.12, chroma: 0.9 },
  dark: { lightness: [0.215, 0.2, 0.18], drop: -0.12, chroma: 0.8 },
} as const;
/** How far the lit and far stops lean warm and cool, at full vividness. */
const SHADE = [10, 0, 12];

/**
 * The lightest a dark stop and the darkest a light stop may be, as relative
 * luminance: where fg-muted (tokens.css) still has 4.5:1 on it. TONE keeps
 * inside these; this catches whatever rounding or the gamut leaves.
 */
const LUMINANCE = { light: 0.56, dark: 0.048 };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Lightens (light) or darkens (dark) a stop just enough to stay legible. */
function legible(color: Oklch, tone: 'light' | 'dark'): string {
  let hex = oklchToHex(color);
  for (let step = 0; step < 20; step++) {
    const lum = luminance(hex);
    if (tone === 'light' ? lum >= LUMINANCE.light : lum <= LUMINANCE.dark)
      break;
    color = { ...color, l: color.l + (tone === 'light' ? 0.01 : -0.01) };
    hex = oklchToHex(color);
  }
  return hex;
}

/** A gradient's three stops in a scheme, at an intensity from 0 to 1. */
export function themeStops(
  colors: readonly string[],
  tone: 'light' | 'dark' | 'swatch',
  intensity = INTENSITY,
): [string, string, string] {
  const stops = stopsOf(colors);
  // The swatch shows the colours as picked, as the canvas does.
  if (tone === 'swatch')
    return stops.map((stop) => oklchToHex(stop)) as [string, string, string];
  const t = Math.min(1, Math.max(0, intensity));
  const { lightness, drop, chroma } = TONE[tone];
  return stops.map((stop, i) => {
    // How vivid the dot was on the canvas: greys stay grey.
    const vivid = Math.min(1, stop.c / (maxChroma(stop.l, stop.h) || 1));
    const l = lightness[i]! - drop * t;
    const h =
      i === 0
        ? towards(stop.h, WARM, SHADE[0]! * vivid)
        : i === 2
          ? towards(stop.h, COOL, SHADE[2]! * vivid)
          : stop.h;
    const c = vivid * maxChroma(l, h) * chroma * (0.12 + 0.88 * t ** 1.2);
    return legible({ l, c, h }, tone);
  }) as [string, string, string];
}

/**
 * The CSS background for a gradient: the lit and far corners glow over a
 * sweep through all three, mixed in OKLab so no band turns muddy.
 */
export function themeImage(
  colors: readonly string[],
  tone: 'light' | 'dark' | 'swatch',
  intensity = INTENSITY,
): string {
  const [a, b, c] = themeStops(colors, tone, intensity);
  return [
    `radial-gradient(90% 70% at 0% 0% in oklab, ${a} 0%, transparent 70%)`,
    `radial-gradient(80% 80% at 100% 100% in oklab, ${c} 0%, transparent 70%)`,
    `linear-gradient(150deg in oklab, ${a}, ${b} 50%, ${c})`,
  ].join(', ');
}

/**
 * Symbols a workspace can use as its icon (Lucide names), in the order the
 * picker shows them. Saved workspaces refer to these names, so only add.
 */
export const SYMBOLS = [
  'star',
  'bookmark',
  'heart',
  'zap',
  'triangle',
  'asterisk',
  'bell',
  'lightbulb',
  'message-circle',
  'users',
  'wrench',
  'egg',
  'circle',
  'moon',
  'orbit',
  'leaf',
  'cloud',
  'paw-print',
  'utensils',
  'plane',
  'music',
  'gamepad-2',
  'code',
  'skull',
  'house',
  'briefcase',
  'book-open',
  'graduation-cap',
  'flask-conical',
  'palette',
  'camera',
  'film',
  'newspaper',
  'globe',
  'coffee',
  'shopping-bag',
  'wallet',
  'rocket',
  'sparkles',
  'dumbbell',
] as const;

export const DEFAULT_APPEARANCE: WorkspaceAppearance = {
  icon: { kind: 'letter' },
  accent: 'ember',
  frame: 'paper',
  mode: 'system',
};

const CUSTOM_ACCENT = /^#[0-9a-f]{6}$/i;

export function isCustomAccent(accent: string): boolean {
  return CUSTOM_ACCENT.test(accent);
}

export function framePreset(id: string): FramePreset {
  return FRAMES.find((frame) => frame.id === id) ?? FRAMES[0]!;
}

/**
 * Accent colours for light and dark. A custom colour keeps its hue and
 * chroma at a lightness each scheme can read: deep on light frames, light
 * on dark ones.
 */
export function accentColors(accent: string): { light: string; dark: string } {
  if (isCustomAccent(accent)) {
    const { c, h } = hexToOklch(accent);
    return {
      light: oklchToHex({ l: 0.5, c, h }),
      dark: oklchToHex({ l: 0.8, c, h }),
    };
  }
  const preset = ACCENTS.find((other) => other.id === accent) ?? ACCENTS[0]!;
  return { light: preset.light, dark: preset.dark };
}

/** How much of the accent tints the window frame, like an Arc space. */
const FRAME_TINT = { light: 0.06, dark: 0.05 };

function mixHex(a: string, b: string, amountOfA: number): string {
  const channel = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) * amountOfA + channel(b, i) * (1 - amountOfA))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * The window frame around the page: the frame preset's chrome with a little
 * of the accent. A hex colour, since the main process paints the window
 * background with it too.
 */
export function frameColor(
  appearance: WorkspaceAppearance,
  dark: boolean,
): string {
  // A gradient's middle stop stands in where only one colour will do.
  const colors = appearanceColors(appearance);
  const intensity = appearance.intensity ?? INTENSITY;
  if (colors) return themeStops(colors, dark ? 'dark' : 'light', intensity)[1];
  const chrome = dark
    ? framePreset(appearance.frame).dark.chrome
    : framePreset(appearance.frame).light.chrome;
  const accents = accentColors(appearance.accent);
  const accent = dark ? accents.dark : accents.light;
  // Intensity scales the tint: none at 0, twice the usual at 1.
  const tint =
    (dark ? FRAME_TINT.dark : FRAME_TINT.light) * (intensity / INTENSITY);
  return mixHex(accent, chrome, tint);
}

/**
 * The look a new workspace starts with. The accent rotates through the
 * presets so new workspaces don't all look alike.
 */
export function newWorkspaceAppearance(
  existingCount: number,
): WorkspaceAppearance {
  const accent = ACCENTS[existingCount % ACCENTS.length]!;
  return { ...DEFAULT_APPEARANCE, accent: accent.id };
}
