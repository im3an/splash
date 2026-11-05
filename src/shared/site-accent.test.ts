import { describe, expect, it } from 'vitest';
import { hexToOklch } from './color';
import { accentTones, dominantColor } from './site-accent';

const pixels = (...colors: [number, number, number, number][]) =>
  new Uint8Array(colors.flat());
const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [255, 0, 0, 0];

describe('dominantColor', () => {
  it('finds the colour an icon is mostly made of', () => {
    expect(dominantColor(pixels(RED, RED, RED, BLUE))).toBe('#ff0000');
  });

  it('ignores white and transparent pixels', () => {
    expect(dominantColor(pixels(RED, WHITE, WHITE, CLEAR, CLEAR))).toBe(
      '#ff0000',
    );
  });

  it('reads BGRA', () => {
    expect(dominantColor(pixels(BLUE), 'bgra')).toBe('#ff0000');
  });

  it('gives a monochrome or empty icon no colour', () => {
    expect(dominantColor(pixels(WHITE, [0, 0, 0, 255]))).toBeNull();
    expect(dominantColor(pixels(CLEAR))).toBeNull();
    expect(dominantColor(new Uint8Array())).toBeNull();
  });

  it('does not count a few stray coloured pixels', () => {
    expect(dominantColor(pixels(RED, ...Array(20).fill(WHITE)))).toBeNull();
  });
});

describe('accentTones', () => {
  it('lightens for the dark theme and darkens for the light one', () => {
    const { light, dark } = accentTones('#ff0000');
    expect(hexToOklch(dark).l).toBeGreaterThanOrEqual(0.73);
    expect(hexToOklch(light).l).toBeLessThanOrEqual(0.51);
  });
});
