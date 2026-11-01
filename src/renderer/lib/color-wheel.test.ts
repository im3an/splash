import {
  harmonies,
  hexToHsl,
  hexToPoint,
  hslToHex,
  offsetToPoint,
  parseHex,
  pointToHex,
  pointToOffset,
  spreadBetween,
  SPREAD,
} from './color-wheel';

describe('colour wheel', () => {
  it('converts between hex and HSL', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 25)).toBe('#008000');
    expect(hslToHex(360, 100, 50)).toBe('#ff0000');
    const { hue, saturation, lightness } = hexToHsl('#2d6cb0');
    expect(Math.round(hue)).toBe(211);
    expect(Math.round(saturation)).toBe(59);
    expect(Math.round(lightness)).toBe(43);
    expect(hexToHsl('#808080').saturation).toBe(0);
  });

  it('round-trips a wheel colour to the same place', () => {
    const point = { hue: 200, radius: 0.4 };
    const back = hexToPoint(pointToHex(point));
    expect(back.hue).toBeCloseTo(200, 0);
    expect(back.radius).toBeCloseTo(0.4, 1);
  });

  it('keeps colours outside the lightness range on the wheel', () => {
    expect(hexToPoint('#000000').radius).toBe(0);
    expect(hexToPoint('#ffffff').radius).toBe(1);
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

  it('reads typed hex colours', () => {
    expect(parseHex('2D6CB0')).toBe('#2d6cb0');
    expect(parseHex(' #abc ')).toBe('#aabbcc');
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('blue')).toBeNull();
  });
});
