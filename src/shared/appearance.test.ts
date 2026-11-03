import {
  accentColors,
  appearanceGrain,
  DEFAULT_APPEARANCE,
  frameColor,
  GRAIN,
  THEMES,
  themeStops,
} from './appearance';
import { hexToOklch, pointToHex } from './color';

// tokens.css: sidebar text sits straight on the frame's gradient.
const MUTED = { light: '#585047', dark: '#b3a89b' };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

// Every hue around the canvas, from grey to the rim.
const canvas = Array.from({ length: 24 }, (_, i) =>
  [0, 0.35, 0.7, 1].map((radius) => pointToHex({ hue: i * 15, radius })),
).flat();
const palettes: (readonly string[])[] = [
  ...THEMES.map((preset) => preset.colors),
  ...canvas.map((hex) => [hex]),
  ...canvas.map((hex, i) => [hex, canvas[(i + 37) % canvas.length]!]),
  ...canvas.map((hex, i) => [
    hex,
    canvas[(i + 21) % canvas.length]!,
    canvas[(i + 55) % canvas.length]!,
  ]),
];
const INTENSITIES = [0, 0.25, 0.5, 0.75, 1];

describe('workspace gradients', () => {
  it.each(['light', 'dark'] as const)(
    'keep sidebar text at 4.5:1 at any intensity (%s)',
    (tone) => {
      let worst = Infinity;
      for (const colors of palettes)
        for (const intensity of INTENSITIES)
          for (const stop of themeStops(colors, tone, intensity))
            worst = Math.min(worst, contrast(MUTED[tone], stop));
      expect(worst).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['light', 'dark'] as const)(
    'keep a wheel accent at 3:1 on its own frame (%s)',
    (tone) => {
      let worst = Infinity;
      for (const colors of palettes) {
        const accent = accentColors(colors[0]!)[tone];
        for (const stop of themeStops(colors, tone, 1))
          worst = Math.min(worst, contrast(accent, stop));
      }
      expect(worst).toBeGreaterThanOrEqual(3);
    },
  );

  it('keep the hue that was picked', () => {
    const blue = pointToHex({ hue: 255, radius: 0.8 });
    const [, middle] = themeStops([blue], 'light', 1);
    expect(hexToOklch(middle).h).toBeCloseTo(255, -1);
  });

  it('give one colour companions that lean warm and cool', () => {
    const [lit, middle, far] = themeStops(
      [pointToHex({ hue: 160, radius: 0.8 })],
      'swatch',
    );
    expect(new Set([lit, middle, far]).size).toBe(3);
    expect(hexToOklch(lit).h).toBeLessThan(hexToOklch(middle).h);
    expect(hexToOklch(far).h).toBeGreaterThan(hexToOklch(middle).h);
  });

  it('meet two colours at full chroma, not grey', () => {
    const red = pointToHex({ hue: 25, radius: 0.9 });
    const teal = pointToHex({ hue: 185, radius: 0.9 });
    const [, middle] = themeStops([red, teal], 'swatch');
    expect(hexToOklch(middle).c).toBeGreaterThan(0.8 * hexToOklch(red).c);
  });

  it('stay grey for a grey dot and fade out at no intensity', () => {
    for (const stop of themeStops([pointToHex({ hue: 0, radius: 0 })], 'dark'))
      expect(hexToOklch(stop).c).toBeLessThan(0.01);
    const [stop] = themeStops(THEMES[0]!.colors, 'light', 0);
    expect(hexToOklch(stop).c).toBeLessThan(0.03);
  });

  it('give the frame the gradient middle at the chosen intensity', () => {
    const appearance = { ...DEFAULT_APPEARANCE, gradient: 'dusk' };
    expect(frameColor({ ...appearance, intensity: 1 }, true)).toBe(
      themeStops(THEMES[0]!.colors, 'dark', 1)[1],
    );
  });

  it('give gradients grain unless set, and plain frames none', () => {
    expect(appearanceGrain(DEFAULT_APPEARANCE)).toBe(0);
    expect(
      appearanceGrain({ ...DEFAULT_APPEARANCE, colors: ['#3366cc'] }),
    ).toBe(GRAIN);
    expect(appearanceGrain({ ...DEFAULT_APPEARANCE, grain: 0.8 })).toBe(0.8);
  });
});
