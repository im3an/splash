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
  { id: 'amber', label: 'Amber', light: '#a86f0c', dark: '#e6b04f' },
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

/** Symbols a workspace can use as its icon (Lucide names). */
export const SYMBOLS = [
  'house',
  'briefcase',
  'code',
  'book-open',
  'graduation-cap',
  'flask-conical',
  'palette',
  'camera',
  'music',
  'film',
  'gamepad-2',
  'newspaper',
  'plane',
  'globe',
  'leaf',
  'coffee',
  'shopping-bag',
  'wallet',
  'heart',
  'star',
  'rocket',
  'sparkles',
  'users',
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
