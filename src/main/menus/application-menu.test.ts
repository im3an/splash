import type { MenuItemConstructorOptions } from 'electron';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { sampleSnapshot } from '../../renderer/test-fixtures';
import { installApplicationMenu, type MenuActions } from './application-menu';

const electron = vi.hoisted(() => ({
  focused: vi.fn(),
  build: vi.fn((template: MenuItemConstructorOptions[]) => template),
}));
vi.mock('../browser/electron-page-host', () => ({ contentsForPage: vi.fn() }));
vi.mock('electron', () => ({
  app: { name: 'Splash', isPackaged: true },
  BrowserWindow: { getFocusedWindow: electron.focused },
  clipboard: {},
  nativeTheme: { themeSource: 'system' },
  Menu: { buildFromTemplate: electron.build, setApplicationMenu: vi.fn() },
}));

function setup() {
  const browser = {
    window: { close: vi.fn() },
    controller: {
      activePageId: 'a' as string | null,
      snapshot: () => sampleSnapshot(),
      recentlyClosed: () => [],
      closePage: vi.fn(),
    },
  };
  const actions = {
    currentWindow: () => browser,
    preferences: { get: () => DEFAULT_PREFERENCES },
    store: { frequentHistory: () => [] },
  } as unknown as MenuActions;
  installApplicationMenu(actions);
  const template = electron.build.mock.calls.at(-1)![0];
  const file = template.find((item) => item.label === 'File')!;
  const item = (file.submenu as MenuItemConstructorOptions[]).find(
    (item) => item.accelerator === 'CmdOrCtrl+W',
  )!;
  return { browser, close: item.click as () => void };
}

it('closes the focused Settings window without touching browser pages', () => {
  const { browser, close } = setup();
  const settings = { close: vi.fn() };
  electron.focused.mockReturnValue(settings);
  close();
  expect(settings.close).toHaveBeenCalledOnce();
  expect(browser.controller.closePage).not.toHaveBeenCalled();
  expect(browser.window.close).not.toHaveBeenCalled();
});

it('still closes the active page when its browser window is focused', () => {
  const { browser, close } = setup();
  electron.focused.mockReturnValue(browser.window);
  close();
  expect(browser.controller.closePage).toHaveBeenCalledWith('a');
  expect(browser.window.close).not.toHaveBeenCalled();
});
