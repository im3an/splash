import { menuPosition } from './menu-position';
const base = {
  x: 250,
  y: 100,
  width: 236,
  height: 240,
  left: 8,
  right: 268,
  viewportHeight: 700,
};
describe('menu placement', () => {
  it('keeps pointer menus inside the sidebar', () => {
    const result = menuPosition(base);
    expect(result.left).toBe(14);
    expect(result.top).toBe(100);
  });
  it('anchors toolbar menus to the right edge without an extra offset', () => {
    const result = menuPosition({
      ...base,
      x: 1100,
      right: 1200,
      align: 'end',
    });
    expect(result.left).toBe(864);
  });
  it('opens above a toolbar anchor when there is no room below', () => {
    const result = menuPosition({ ...base, y: 650, anchorTop: 620 });
    expect(result.top).toBe(380);
  });
  it('bounds oversized menus and handles narrow windows', () => {
    const result = menuPosition({
      ...base,
      width: 400,
      height: 1400,
      right: 150,
    });
    expect(result.left).toBe(14);
    expect(result.top).toBe(6);
  });
  it('repositions a taller submenu instead of preserving a stale location', () => {
    const small = menuPosition({ ...base, y: 500, height: 100 });
    const large = menuPosition({ ...base, y: 500, height: 350 });
    expect(small.top).toBe(500);
    expect(large.top).toBe(150);
  });
});
