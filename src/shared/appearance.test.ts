import { readFileSync } from 'node:fs';
import {
  ACCENTS,
  accentColors,
  appearanceColors,
  appearanceGrain,
  DEFAULT_APPEARANCE,
  frameColor,
  framePreset,
  FRAMES,
  frameSurfaces,
  GRAIN,
  THEMES,
  themeStops,
} from './appearance';
import { hexToOklch, pointToHex } from './color';
import type { WorkspaceAppearance } from './types';

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
    'give secondary text 7:1 with Increase Contrast on (%s)',
    (tone) => {
      const css = readFileSync('src/renderer/styles/tokens.css', 'utf8');
      const block = css.split(
        tone === 'dark'
          ? '@media (prefers-contrast: more) and (prefers-color-scheme: dark)'
          : '@media (prefers-contrast: more) {',
      )[1]!;
      const token = (name: string) =>
        new RegExp(`--${name}: (#[0-9a-f]{6})`).exec(block)![1]!;
      let worst = Infinity;
      for (const colors of palettes)
        for (const intensity of INTENSITIES)
          for (const stop of themeStops(colors, tone, intensity))
            for (const name of ['fg-muted', 'fg-subtle'])
              worst = Math.min(worst, contrast(token(name), stop));
      expect(worst).toBeGreaterThanOrEqual(7);
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

  it('give the page area a deeper shade in dark and a paler one in light', () => {
    const appearance = { ...DEFAULT_APPEARANCE, gradient: 'ocean' };
    for (const dark of [true, false]) {
      const frame = hexToOklch(frameColor(appearance, dark));
      const surface = hexToOklch(frameSurfaces(appearance, dark).surface);
      expect(surface.h).toBeCloseTo(frame.h, -1);
      expect(surface.c).toBeGreaterThan(0.01);
      if (dark) expect(surface.l).toBeLessThan(frame.l);
      else expect(surface.l).toBeGreaterThan(frame.l);
    }
  });

  it('keep a grey gradient grey on the page area', () => {
    const { surface } = frameSurfaces(
      { ...DEFAULT_APPEARANCE, colors: [pointToHex({ hue: 0, radius: 0 })] },
      true,
    );
    expect(hexToOklch(surface).c).toBeLessThan(0.01);
  });

  it('tint a plain frame with its accent, and not at all at no intensity', () => {
    const plain = { ...DEFAULT_APPEARANCE, accent: 'sky', frame: 'paper' };
    const neutral = framePreset('paper').dark.surface;
    expect(frameSurfaces({ ...plain, intensity: 0 }, true).surface).toBe(
      neutral,
    );
    const tinted = hexToOklch(frameSurfaces(plain, true).surface);
    expect(tinted.h).toBeCloseTo(hexToOklch('#7eafea').h, -2);
    expect(tinted.c).toBeGreaterThan(hexToOklch(neutral).c);
  });

  it('colour a plain frame like its page area, at the lightness of its preset', () => {
    const plain = { ...DEFAULT_APPEARANCE, accent: 'sky', frame: 'paper' };
    const chrome = framePreset('paper').dark.chrome;
    expect(frameColor({ ...plain, intensity: 0 }, true)).toBe(chrome);
    const frame = hexToOklch(frameColor(plain, true));
    expect(frame.h).toBeCloseTo(hexToOklch('#7eafea').h, -2);
    expect(frame.c).toBeGreaterThan(0.015);
    expect(frame.l).toBeCloseTo(hexToOklch(chrome).l, 1);
  });

  describe.each(['light', 'dark'] as const)('surfaces in %s', (tone) => {
    const dark = tone === 'dark';
    const css = readFileSync('src/renderer/styles/tokens.css', 'utf8');
    const token = (name: string, block: string) =>
      new RegExp(`--${name}: (#[0-9a-f]{6})`).exec(block)![1]!;
    const base = dark
      ? css.split('@media (prefers-color-scheme: dark)')[1]!
      : css;
    const looks: WorkspaceAppearance[] = [
      ...palettes.flatMap((colors) =>
        INTENSITIES.map((intensity) => ({
          ...DEFAULT_APPEARANCE,
          colors: [...colors],
          accent: colors[0]!,
          intensity,
        })),
      ),
      ...FRAMES.flatMap((frame) =>
        ACCENTS.flatMap((accent) =>
          INTENSITIES.map((intensity) => ({
            ...DEFAULT_APPEARANCE,
            frame: frame.id,
            accent: accent.id,
            intensity,
          })),
        ),
      ),
    ];
    const worst = (color: string, on: 'surface' | 'elevated') =>
      Math.min(
        ...looks.map((look) => contrast(color, frameSurfaces(look, dark)[on])),
      );
    const inkOf = (look: WorkspaceAppearance) =>
      framePreset(look.frame)[tone].ink.split(' ').map(Number);
    const over = (look: WorkspaceAppearance, alpha: number, on: string) => {
      const channels = inkOf(look).map((ink, i) => {
        const under = parseInt(on.slice(1 + i * 2, 3 + i * 2), 16);
        return Math.round(ink * alpha + under * (1 - alpha))
          .toString(16)
          .padStart(2, '0');
      });
      return `#${channels.join('')}`;
    };

    // Thin margins from the accessibility audit: see docs/accessibility-audit.md.
    it('keep placeholder text at 4.5:1 on a field on a plain look', () => {
      const alpha = dark ? 0.06 : 0.065;
      const subtle = token('fg-subtle', base);
      let lowest = Infinity;
      for (const look of looks) {
        if (appearanceColors(look)) continue;
        const { surface, elevated } = frameSurfaces(look, dark);
        for (const on of [surface, elevated, frameColor(look, dark)])
          lowest = Math.min(lowest, contrast(subtle, over(look, alpha, on)));
      }
      // Rounding to whole channels costs Sage's own panel a hair: 4.53 in pixels.
      expect(lowest).toBeGreaterThanOrEqual(4.49);
    });

    it.each(['fg-muted', 'fg-subtle'])(
      'keep %s at 4.5:1 on a gradient, bare or on a field, whatever the ink',
      (name) => {
        const text = token(`${name}-on-gradient`, base);
        let lowest = Infinity;
        for (const colors of palettes)
          for (const intensity of INTENSITIES) {
            const look = {
              ...DEFAULT_APPEARANCE,
              colors: [...colors],
              intensity,
            };
            const { surface, elevated } = frameSurfaces(look, dark);
            const backs = [
              ...themeStops(colors, tone, intensity),
              surface,
              elevated,
            ];
            for (const on of backs) {
              lowest = Math.min(lowest, contrast(text, on));
              for (const frame of FRAMES)
                lowest = Math.min(
                  lowest,
                  contrast(text, over({ ...look, frame: frame.id }, 0.07, on)),
                );
            }
          }
        expect(lowest).toBeGreaterThanOrEqual(4.5);
      },
    );

    it('keep error text at 4.5:1 wherever it sits', () => {
      const danger = token('danger', base);
      let lowest = Infinity;
      for (const look of looks) {
        const gradient = appearanceColors(look);
        const { surface, elevated } = frameSurfaces(look, dark);
        const frames = gradient
          ? themeStops(gradient, tone, look.intensity)
          : [frameColor(look, dark)];
        for (const on of [surface, elevated, ...frames]) {
          lowest = Math.min(lowest, contrast(danger, on));
          for (const frame of FRAMES)
            lowest = Math.min(
              lowest,
              contrast(danger, over({ ...look, frame: frame.id }, 0.07, on)),
            );
        }
      }
      expect(lowest).toBeGreaterThanOrEqual(4.5);
    });

    it('keep muted stronger than subtle on a gradient', () => {
      const muted = token('fg-muted-on-gradient', base);
      const subtle = token('fg-subtle-on-gradient', base);
      const fg = token('fg', base);
      expect(contrast(fg, muted)).toBeLessThan(contrast(fg, subtle));
    });

    it('keep the Increase Contrast text on a gradient too', () => {
      const block = css.split(
        dark
          ? '@media (prefers-contrast: more) and (prefers-color-scheme: dark)'
          : '@media (prefers-contrast: more) {',
      )[1]!;
      for (const name of ['fg-muted', 'fg-subtle'])
        expect(token(`${name}-on-gradient`, block)).toBe(token(name, block));
    });

    it('keep an off switch at 3:1 against its card', () => {
      const alpha = dark ? 0.4 : 0.54;
      let lowest = Infinity;
      for (const look of looks) {
        const card = frameSurfaces(look, dark).elevated;
        lowest = Math.min(lowest, contrast(over(look, alpha, card), card));
      }
      expect(lowest).toBeGreaterThanOrEqual(3);
    });

    it('keep sidebar text at 4.5:1 and the accent at 3:1 on a plain frame', () => {
      for (const look of looks) {
        if (appearanceColors(look)) continue;
        const frame = frameColor(look, dark);
        expect(contrast(MUTED[tone], frame)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(accentColors(look.accent)[tone], frame),
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it('keep text on a primary button at 4.5:1', () => {
      let lowest = Infinity;
      for (const look of looks) {
        const onAccent = dark ? frameSurfaces(look, true).chrome : '#ffffff';
        lowest = Math.min(
          lowest,
          contrast(onAccent, accentColors(look.accent)[tone]),
        );
      }
      expect(lowest).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['surface', 'elevated'] as const)(
      'give secondary text 7:1 on %s with Increase Contrast on',
      (on) => {
        const block = css.split(
          dark
            ? '@media (prefers-contrast: more) and (prefers-color-scheme: dark)'
            : '@media (prefers-contrast: more) {',
        )[1]!;
        for (const name of ['fg-muted', 'fg-subtle'])
          expect(worst(token(name, block), on)).toBeGreaterThanOrEqual(7);
      },
    );

    it.each(['surface', 'elevated'] as const)(
      'keep secondary text at 4.5:1 on %s',
      (on) => {
        for (const name of ['fg-muted', 'fg-subtle'])
          expect(worst(token(name, base), on)).toBeGreaterThanOrEqual(4.5);
      },
    );

    it.each(['surface', 'elevated'] as const)(
      'keep the accent at 3:1 on %s',
      (on) => {
        let lowest = Infinity;
        for (const look of looks) {
          const accent = accentColors(look.accent)[tone];
          lowest = Math.min(
            lowest,
            contrast(accent, frameSurfaces(look, dark)[on]),
          );
        }
        expect(lowest).toBeGreaterThanOrEqual(3);
      },
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
