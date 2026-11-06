import type { MenuItemConstructorOptions } from 'electron';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { sampleSnapshot } from '../../renderer/test-fixtures';
import { installApplicationMenu, type MenuActions } from './application-menu';

const electron = vi.hoisted(() => ({
  focused: vi.fn(),
  focusedContents: vi.fn(),
  build: vi.fn((template: MenuItemConstructorOptions[]) => template),
}));
vi.mock('../browser/electron-page-host', () => ({
  contentsForPage: vi.fn(),
  pageHandleFor: (contents: { isPage?: boolean } | null) =>
    contents?.isPage ? {} : undefined,
}));
vi.mock('electron', () => ({
  app: { name: 'Splash', isPackaged: true },
  BrowserWindow: { getFocusedWindow: electron.focused },
  clipboard: {},
  nativeTheme: { themeSource: 'system' },
  Menu: { buildFromTemplate: electron.build, setApplicationMenu: vi.fn() },
  webContents: { getFocusedWebContents: electron.focusedContents },
}));

function setup() {
  const browser = {
    window: {
      close: vi.fn(),
      isAlwaysOnTop: () => false,
      setAlwaysOnTop: vi.fn(),
    },
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
  const view = template.find((entry) => entry.label === 'View')!;
  const keepOnTop = (view.submenu as MenuItemConstructorOptions[]).find(
    (entry) => entry.label === 'Keep Window on Top',
  )!;
  return { browser, close: item.click as () => void, keepOnTop };
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

it('keeps the window on top when asked, and lets it go again', () => {
  const { browser, keepOnTop } = setup();
  const click = keepOnTop.click as unknown as (item: {
    checked: boolean;
  }) => void;
  expect(keepOnTop.checked).toBe(false);
  click({ checked: true });
  expect(browser.window.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  click({ checked: false });
  expect(browser.window.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
});

describe('Edit › Undo and Redo', () => {
  function editSetup(
    offered: boolean,
    focus: 'page' | 'field' | 'shell' | 'none',
  ) {
    const window = { webContents: { id: 'shell' }, isAlwaysOnTop: () => false };
    const browser = {
      window,
      trailUndoOffered: offered,
      sendUiCommand: vi.fn(),
      sendToTrail: vi.fn(),
      controller: {
        activePageId: null,
        snapshot: () => sampleSnapshot(),
        recentlyClosed: () => [],
      },
    };
    const page = {
      isPage: true,
      isDestroyed: () => false,
      undo: vi.fn(),
      redo: vi.fn(),
      executeJavaScriptInIsolatedWorld: async () => focus === 'field',
    };
    electron.focusedContents.mockReturnValue(
      focus === 'none' ? null : focus === 'shell' ? window.webContents : page,
    );
    installApplicationMenu({
      currentWindow: () => browser,
      preferences: { get: () => DEFAULT_PREFERENCES },
      store: { frequentHistory: () => [] },
    } as unknown as MenuActions);
    const edit = electron.build.mock.calls
      .at(-1)![0]
      .find((entry) => entry.label === 'Edit')!;
    const press = async (label: 'Undo' | 'Redo') => {
      const item = (edit.submenu as MenuItemConstructorOptions[]).find(
        (entry) => entry.label === label,
      )!;
      (item.click as unknown as (item: null, target: unknown) => void)(
        null,
        window,
      );
      await vi.waitFor(() => {
        const sent =
          browser.sendUiCommand.mock.calls.length +
          browser.sendToTrail.mock.calls.length +
          page.undo.mock.calls.length +
          page.redo.mock.calls.length;
        expect(sent).toBeGreaterThan(0);
      });
    };
    return { browser, page, press };
  }

  it('reaches the trail from a page while a toast offers it, keeping focus', async () => {
    const { browser, page, press } = editSetup(true, 'page');
    await press('Redo');
    expect(browser.sendToTrail).toHaveBeenCalledWith({
      type: 'redo',
      trail: true,
    });
    expect(browser.sendUiCommand).not.toHaveBeenCalled();
    expect(page.redo).not.toHaveBeenCalled();
  });

  it('leaves a page’s typing alone', async () => {
    const { browser, page, press } = editSetup(true, 'field');
    await press('Undo');
    expect(page.undo).toHaveBeenCalledOnce();
    expect(browser.sendToTrail).not.toHaveBeenCalled();
  });

  it('stays with the page with no toast', async () => {
    const { browser, page, press } = editSetup(false, 'page');
    await press('Undo');
    expect(page.undo).toHaveBeenCalledOnce();
    expect(browser.sendToTrail).not.toHaveBeenCalled();
  });

  it('reaches the trail when the page that had focus has just closed', async () => {
    const { browser, press } = editSetup(true, 'none');
    await press('Undo');
    expect(browser.sendToTrail).toHaveBeenCalledWith({
      type: 'undo',
      trail: true,
    });
  });

  it('still lets the shell decide with focus in the shell', async () => {
    const { browser, press } = editSetup(false, 'shell');
    await press('Undo');
    expect(browser.sendUiCommand).toHaveBeenCalledWith({ type: 'undo' });
  });
});
