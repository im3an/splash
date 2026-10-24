import { contentBounds } from './layout';

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
