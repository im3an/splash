import {
  app,
  Menu,
  nativeTheme,
  type MenuItemConstructorOptions,
} from 'electron';
import type { TrailWindow } from './windows/browser-window';

export interface MenuActions {
  /** The window menu commands act on, creating one if none is open. */
  currentWindow(): TrailWindow | null;
  openWindow(): TrailWindow;
}

type Appearance = typeof nativeTheme.themeSource;

/**
 * The application menu. Browser shortcuts live here rather than in the shell
 * UI so they work no matter which view — shell or page — has focus.
 */
export function installApplicationMenu(actions: MenuActions): void {
  const withActivePage = (
    run: (window: TrailWindow, pageId: string) => void,
  ) => {
    return () => {
      const window = actions.currentWindow();
      const pageId = window?.controller.activePageId;
      if (window && pageId) run(window, pageId);
    };
  };

  const appearance = (label: string, source: Appearance) =>
    ({
      label,
      type: 'radio',
      checked: nativeTheme.themeSource === source,
      click: () => {
        nativeTheme.themeSource = source;
      },
    }) satisfies MenuItemConstructorOptions;

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Page',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            window.controller.createPage();
            window.sendUiCommand('focus-address-bar');
          },
        },
        {
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () =>
            actions.currentWindow()?.sendUiCommand('focus-address-bar'),
        },
        { type: 'separator' },
        {
          label: 'Close Page',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const window = actions.currentWindow();
            if (!window) return;
            const pageId = window.controller.activePageId;
            if (pageId) window.controller.closePage(pageId);
            else window.window.close();
          },
        },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+S',
          click: () => actions.currentWindow()?.sendUiCommand('toggle-sidebar'),
        },
        { type: 'separator' },
        {
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: withActivePage((w, id) => w.controller.reload(id)),
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+.',
          click: withActivePage((w, id) => w.controller.stop(id)),
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            appearance('System', 'system'),
            appearance('Light', 'light'),
            appearance('Dark', 'dark'),
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Developer Tools for Page',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: withActivePage((w, id) => w.controller.toggleDevTools(id)),
        },
        ...(app.isPackaged
          ? []
          : ([
              {
                label: 'Developer Tools for Shell',
                accelerator: 'Alt+CmdOrCtrl+J',
                click: () =>
                  actions.currentWindow()?.window.webContents.toggleDevTools(),
              },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: withActivePage((w, id) => w.controller.goBack(id)),
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: withActivePage((w, id) => w.controller.goForward(id)),
        },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
