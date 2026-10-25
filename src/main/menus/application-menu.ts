import {
  app,
  Menu,
  nativeTheme,
  type MenuItemConstructorOptions,
} from 'electron';
import type { PreferencesService } from '../preferences';
import type { TrailStore } from '../storage/trail-store';
import type { TrailWindow } from '../windows/browser-window';
import { workspaceMenuItems } from './workspace-menu';

export interface MenuActions {
  /** The window menu commands act on, creating one if none is open. */
  currentWindow(): TrailWindow | null;
  openWindow(): TrailWindow;
  openSettings(): void;
  store: TrailStore;
  preferences: PreferencesService;
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
      checked: actions.preferences.get().theme === source,
      click: () => actions.preferences.update({ theme: source }),
    }) satisfies MenuItemConstructorOptions;

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => actions.openSettings(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Page',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            window.controller.createPage();
            window.sendUiCommand({ type: 'focus-address-bar' });
          },
        },
        {
          label: 'New Child Page',
          accelerator: 'Alt+CmdOrCtrl+T',
          click: withActivePage((w, id) => {
            w.controller.createChildPage(id);
            w.sendUiCommand({ type: 'focus-address-bar' });
          }),
        },
        {
          label: 'Duplicate Page',
          click: withActivePage((w, id) => w.controller.duplicatePage(id)),
        },
        {
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () =>
            actions
              .currentWindow()
              ?.sendUiCommand({ type: 'focus-address-bar' }),
        },
        { type: 'separator' },
        {
          label: 'Reopen Closed',
          accelerator: 'Shift+CmdOrCtrl+T',
          click: () => actions.currentWindow()?.controller.reopenClosed(),
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
        {
          label: 'Close Branch',
          accelerator: 'Alt+CmdOrCtrl+W',
          click: withActivePage((w, id) => w.controller.closeBranch(id)),
        },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: withActivePage((w) =>
            w.sendUiCommand({ type: 'find', action: 'open' }),
          ),
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: withActivePage((w) =>
            w.sendUiCommand({ type: 'find', action: 'next' }),
          ),
        },
        {
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: withActivePage((w) =>
            w.sendUiCommand({ type: 'find', action: 'previous' }),
          ),
        },
        { type: 'separator' },
        { role: 'startSpeaking' },
        { role: 'stopSpeaking' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+K',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'open-palette' }),
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+S',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'toggle-sidebar' }),
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
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: withActivePage((w, id) => w.controller.zoom(id, 'in')),
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: withActivePage((w, id) => w.controller.zoom(id, 'in')),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: withActivePage((w, id) => w.controller.zoom(id, 'out')),
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: withActivePage((w, id) => w.controller.zoom(id, 'reset')),
        },
        { type: 'separator' },
        {
          label: 'Site Settings…',
          click: withActivePage((w) => w.sendUiCommand({ type: 'site-info' })),
        },
        {
          label: 'Mute Page',
          accelerator: 'Ctrl+CmdOrCtrl+M',
          click: withActivePage((w, id) => {
            const page = w.controller.snapshot().pages[id];
            if (page) w.controller.setMuted(id, !page.isMuted);
          }),
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
    {
      label: 'Workspaces',
      submenu: workspaceMenuItems(actions.currentWindow(), {
        accelerators: true,
      }),
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
