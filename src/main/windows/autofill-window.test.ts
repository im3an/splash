import { describe, expect, it, vi } from 'vitest';
import { menuBounds } from './autofill-window';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  nativeTheme: { on: () => undefined },
  screen: {},
}));
vi.mock('./shell-url', () => ({
  shellUrl: () => 'https://shell.test/',
  isSameDocument: () => true,
}));

const area = { x: 0, y: 25, width: 1000, height: 775 };

describe('menuBounds', () => {
  it('sits right under the field, and as wide as it', () => {
    const field = { x: 100, y: 200, width: 300, height: 30 };
    const menu = menuBounds(field, 120, area);
    expect(menu.x).toBe(100);
    expect(menu.y).toBeGreaterThanOrEqual(230);
    expect(menu.y).toBeLessThan(240);
    expect(menu.width).toBe(300);
    expect(menu.height).toBe(120);
  });

  it('goes above a field with no room under it', () => {
    const field = { x: 100, y: 760, width: 300, height: 30 };
    const menu = menuBounds(field, 120, area);
    expect(menu.y + menu.height).toBeLessThanOrEqual(760);
  });

  it('stays on the screen beside the right edge', () => {
    const field = { x: 950, y: 200, width: 300, height: 30 };
    const menu = menuBounds(field, 120, area);
    expect(menu.x + menu.width).toBeLessThanOrEqual(1000);
  });

  it('never goes above the top of the screen', () => {
    const field = { x: 100, y: 40, width: 300, height: 30 };
    expect(menuBounds(field, 900, area).y).toBe(25);
  });

  it('stays readable beside a tiny field', () => {
    const field = { x: 100, y: 200, width: 20, height: 30 };
    expect(menuBounds(field, 120, area).width).toBeGreaterThan(20);
  });
});
