import { showBrandInDock } from './dock-icon';

function setup(isPackaged: boolean) {
  const resized = { size: 512 };
  const image = { resize: vi.fn(() => resized) };
  const dock = { setIcon: vi.fn() };
  showBrandInDock({
    isPackaged,
    dock,
    load: vi.fn(() => image),
    iconPath: '/assets/Splash.png',
  });
  return { dock, image, resized };
}

describe('the Splash icon in the Dock', () => {
  it('is left to the app bundle once packaged, which already has it', () => {
    // Setting it anyway keeps a 32 MB bitmap in the main process.
    expect(setup(true).dock.setIcon).not.toHaveBeenCalled();
  });

  it('replaces Electron’s icon in a development run, at a size the Dock uses', () => {
    const { dock, image, resized } = setup(false);
    expect(image.resize).toHaveBeenCalledWith({ width: 512, height: 512 });
    expect(dock.setIcon).toHaveBeenCalledWith(resized);
  });

  it('does nothing without a Dock', () => {
    expect(() =>
      showBrandInDock({
        isPackaged: false,
        dock: undefined,
        load: vi.fn(),
        iconPath: '/assets/Splash.png',
      }),
    ).not.toThrow();
  });
});
