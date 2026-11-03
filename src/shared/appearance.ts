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

export interface GradientPreset {
  id: string;
  label: string;
  /** Three stops, from the top left corner to the bottom right. */
  light: readonly [string, string, string];
  dark: readonly [string, string, string];
  /** Livelier stops for the picker's swatch, which must read in both modes. */
  swatch: readonly [string, string, string];
  /** The accent preset that suits it; picking the gradient picks it too. */
  accent: string;
}

/**
 * Arc-style backgrounds for the window frame: soft three-colour meshes with
 * a little grain. Light ones are pastels and dark ones deep tones, so the
 * sidebar's text keeps the contrast it has on a plain frame.
 */
export const GRADIENTS: readonly GradientPreset[] = [
  {
    id: 'dusk',
    swatch: ['#f08bb4', '#a98be8', '#6f8ff0'],
    label: 'Dusk',
    light: ['#f7cadb', '#dcc6f2', '#bccbf6'],
    dark: ['#3d1e37', '#2b2047', '#1b2243'],
    accent: 'iris',
  },
  {
    id: 'ember',
    swatch: ['#ffad6b', '#f2735a', '#d9709e'],
    label: 'Ember',
    light: ['#ffd6b5', '#f8b9a6', '#efc4d8'],
    dark: ['#42220f', '#3b1818', '#2d1627'],
    accent: 'ember',
  },
  {
    id: 'meadow',
    swatch: ['#a6dc8a', '#6fcfa9', '#79b8dc'],
    label: 'Meadow',
    light: ['#dcf2d2', '#c6ebdd', '#d4e8f2'],
    dark: ['#1c2d19', '#152c25', '#15242c'],
    accent: 'moss',
  },
  {
    id: 'lagoon',
    swatch: ['#6fd6e0', '#6aa4f0', '#a093ec'],
    label: 'Lagoon',
    light: ['#c9eef1', '#c3daf8', '#d9d2f7'],
    dark: ['#0e2b31', '#13233a', '#1e1c3b'],
    accent: 'teal',
  },
  {
    id: 'aurora',
    swatch: ['#6fe0b4', '#79a6f5', '#c98bec'],
    label: 'Aurora',
    light: ['#c6f0df', '#cddffc', '#ebd0f7'],
    dark: ['#0e2f28', '#142445', '#2e1842'],
    accent: 'sky',
  },
  {
    id: 'bloom',
    swatch: ['#f59cc0', '#fbbd8f', '#f4dc7a'],
    label: 'Bloom',
    light: ['#fbd3e3', '#fde3cf', '#f9f0c9'],
    dark: ['#3e1a2c', '#3a2418', '#2f2a14'],
    accent: 'rose',
  },
  {
    id: 'sand',
    swatch: ['#e9cfa3', '#ddb08c', '#c9a99a'],
    label: 'Sand',
    light: ['#f6e9d3', '#f0dbc4', '#e9d8cf'],
    dark: ['#2f271b', '#2c2119', '#29201d'],
    accent: 'amber',
  },
  {
    id: 'graphite',
    swatch: ['#b9bcc6', '#8d909c', '#5f6270'],
    label: 'Graphite',
    light: ['#eeeef1', '#e0e1e6', '#d2d4db'],
    dark: ['#252529', '#1c1c20', '#131317'],
    accent: 'graphite',
  },
];

export function gradientPreset(
  id: string | null | undefined,
): GradientPreset | null {
  return GRADIENTS.find((gradient) => gradient.id === id) ?? null;
}

/** The CSS background for a gradient: a mesh of its three stops. */
export function gradientImage(
  gradient: GradientPreset,
  tone: 'light' | 'dark' | 'swatch',
): string {
  const [a, b, c] = gradient[tone];
  return [
    `radial-gradient(90% 70% at 0% 0%, ${a} 0%, transparent 70%)`,
    `radial-gradient(80% 80% at 100% 100%, ${c} 0%, transparent 70%)`,
    `linear-gradient(150deg, ${a}, ${b} 50%, ${c})`,
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
 * Accent colours for light and dark. A custom colour is used as is in
 * light mode; dark mode gets a lighter mix so it stays legible.
 */
export function accentColors(accent: string): { light: string; dark: string } {
  if (isCustomAccent(accent)) {
    return {
      light: accent,
      dark: `color-mix(in oklab, ${accent} 70%, white)`,
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
  const gradient = gradientPreset(appearance.gradient);
  if (gradient) return dark ? gradient.dark[1] : gradient.light[1];
  const chrome = dark
    ? framePreset(appearance.frame).dark.chrome
    : framePreset(appearance.frame).light.chrome;
  let accent: string;
  if (isCustomAccent(appearance.accent)) {
    // Dark mode lightens a custom accent the way `accentColors` does.
    accent = dark
      ? mixHex(appearance.accent, '#ffffff', 0.7)
      : appearance.accent;
  } else {
    const preset =
      ACCENTS.find((other) => other.id === appearance.accent) ?? ACCENTS[0]!;
    accent = dark ? preset.dark : preset.light;
  }
  return mixHex(accent, chrome, dark ? FRAME_TINT.dark : FRAME_TINT.light);
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
