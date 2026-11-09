import { hexToOklch, maxChroma, oklchToHex } from '../../shared/color';
import {
  harmonies,
  hexToPoint,
  offsetToPoint,
  pointToHex,
  pointToOffset,
  spreadBetween,
  SPREAD,
} from './color-wheel';

describe('colour wheel', () => {
  it('converts between hex and OKLCH', () => {
    const red = hexToOklch('#ff0000');
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
    expect(oklchToHex(red)).toBe('#ff0000');
    expect(hexToOklch('#808080').c).toBeLessThan(0.001);
  });

  it('fits colours to the screen by cutting chroma, not hue', () => {
    const hex = oklchToHex({ l: 0.74, c: 0.4, h: 255 });
    const fitted = hexToOklch(hex);
    expect(fitted.h).toBeCloseTo(255, -1);
    expect(fitted.c).toBeCloseTo(maxChroma(0.74, 255), 1);
  });

  it('round-trips a wheel colour to the same place', () => {
    const point = { hue: 200, radius: 0.4 };
    const back = hexToPoint(pointToHex(point));
    expect(Math.abs(back.hue - 200)).toBeLessThan(1.5);
    expect(back.radius).toBeCloseTo(0.4, 1);
  });

  it('runs from grey at the centre to the most vivid at the rim', () => {
    expect(hexToOklch(pointToHex({ hue: 140, radius: 0 })).c).toBeLessThan(
      0.001,
    );
    expect(hexToPoint('#808080').radius).toBeLessThan(0.01);
    expect(hexToPoint(pointToHex({ hue: 140, radius: 1 })).radius).toBeCloseTo(
      1,
      1,
    );
  });

  it('puts hue 0 at the top and runs clockwise', () => {
    expect(offsetToPoint(0, -50, 100)).toEqual({ hue: 0, radius: 1 });
    expect(offsetToPoint(25, 0, 100)).toEqual({ hue: 90, radius: 0.5 });
    expect(offsetToPoint(0, 400, 100).radius).toBe(1);
    const { x, y } = pointToOffset({ hue: 90, radius: 0.5 }, 100);
    expect(x).toBeCloseTo(25);
    expect(y).toBeCloseTo(0);
  });

  it('spreads harmonies either side of the main colour', () => {
    const point = { hue: 350, radius: 0.5 };
    expect(harmonies(point, 0, 30)).toEqual([]);
    expect(harmonies(point, 2, 30).map((h) => h.hue)).toEqual([20, 320]);
    expect(spreadBetween(350, 20)).toBe(30);
    expect(spreadBetween(10, 10)).toBe(SPREAD.min);
    expect(spreadBetween(0, 180)).toBe(SPREAD.max);
  });
});
