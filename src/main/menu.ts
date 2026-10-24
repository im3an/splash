import {
  app,
  Menu,
  nativeTheme,
  type MenuItemConstructorOptions,
} from 'electron';
import { specOf, type CommandId } from '../shared/commands';
import type { Appearance } from '../shared/types';
import type { TrailWindow } from './windows/browser-window';

export interface MenuActions {
  /** The window menu commands act on, creating one if none is open. */
  currentWindow(): TrailWindow | null;
  openWindow(): TrailWindow;
}

const WORKSPACE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * The application menu. Browser shortcuts live here rather than in the shell
 * UI so they work no matter which view — shell or page — has focus. Commands
 * that need the shell (editing, confirmations, workspace order) are handed to
 * it; plain page operations run here directly.
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

  /** A menu item whose title and shortcut come from the shared command list. */
  const item = (
    id: CommandId,
    options: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => ({
    id,
    label: specOf(id).title,
    accelerator: specOf(id).shortcut,
    click: () => actions.currentWindow()?.sendUiCommand(id),
    ...options,
  });

  const appearance = (source: Appearance) =>
    item(`appearance.${source}`, {
      type: 'radio',
      checked: nativeTheme.themeSource === source,
    });

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        item('page.new', {
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            window.controller.createPage();
            window.sendUiCommand('address.focus');
          },
        }),
        item('page.new-child'),
        item('workspace.new'),
        item('address.focus'),
        { type: 'separator' },
        item('page.close', {
          click: () => {
            const window = actions.currentWindow();
            if (!window) return;
            const pageId = window.controller.activePageId;
            if (pageId) window.controller.closePage(pageId);
            else window.window.close();
          },
        }),
        item('page.close-tree'),
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Page',
      submenu: [
        item('page.rename'),
        { type: 'separator' },
        item('page.move-up'),
        item('page.move-down'),
        item('page.indent'),
        item('page.outdent'),
        { type: 'separator' },
        item('tree.collapse-all'),
        item('tree.expand-all'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('sidebar.toggle'),
        { type: 'separator' },
        item('nav.reload', {
          click: withActivePage((w, id) => w.controller.reload(id)),
        }),
        item('nav.stop', {
          click: withActivePage((w, id) => w.controller.stop(id)),
        }),
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            appearance('system'),
            appearance('light'),
            appearance('dark'),
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
        item('nav.back', {
          click: withActivePage((w, id) => w.controller.goBack(id)),
        }),
        item('nav.forward', {
          click: withActivePage((w, id) => w.controller.goForward(id)),
        }),
      ],
    },
    {
      label: 'Workspaces',
      submenu: [
        item('workspace.next'),
        item('workspace.previous'),
        { type: 'separator' },
        item('workspace.rename'),
        item('workspace.delete'),
        { type: 'separator' },
        // Numbered slots follow the sidebar's order, which only the shell
        // knows, so they are listed generically and resolved there.
        ...WORKSPACE_SLOTS.map((slot) => item(`workspace.select-${slot}`)),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [item('help.shortcuts')],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Keeps the Appearance radio group in step with the shell's preference. */
export function syncAppearanceMenu(appearance: Appearance): void {
  const menu = Menu.getApplicationMenu();
  const entry = menu?.getMenuItemById(`appearance.${appearance}`);
  if (entry) entry.checked = true;
}
