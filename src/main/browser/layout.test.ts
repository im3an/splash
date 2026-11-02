import { contentBounds, SPLIT_GAP, splitBounds } from './layout';

describe('contentBounds', () => {
  it('subtracts insets from the window size', () => {
    expect(
      contentBounds(
        { width: 1320, height: 860 },
        { top: 48, right: 8, bottom: 8, left: 260 },
      ),
    ).toEqual({ x: 260, y: 48, width: 1052, height: 804 });
  });

  it('never returns negative sizes', () => {
    expect(
      contentBounds(
        { width: 100, height: 100 },
        { top: 80, right: 50, bottom: 50, left: 80 },
      ),
    ).toEqual({ x: 80, y: 80, width: 0, height: 0 });
  });
});

describe('splitBounds', () => {
  it('splits the area into two halves with a gap', () => {
    const [left, right] = splitBounds({
      x: 260,
      y: 48,
      width: 901,
      height: 700,
    });
    expect(left).toEqual({ x: 260, y: 48, width: 446, height: 700 });
    expect(right).toEqual({ x: 714, y: 48, width: 447, height: 700 });
    expect(right.x - (left.x + left.width)).toBe(SPLIT_GAP);
  });

  it('never returns negative sizes', () => {
    const [left, right] = splitBounds({ x: 0, y: 0, width: 4, height: 10 });
    expect(left.width).toBe(0);
    expect(right.width).toBe(0);
  });
});
