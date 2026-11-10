import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  nativeTheme,
  webContents,
  type BaseWindow,
  type MenuItemConstructorOptions,
} from 'electron';
import type { PreferencesService } from '../preferences';
import type { HistoryMatch, TrailStore } from '../storage/trail-store';
import { pagesBelow } from '../../shared/pages-below';
import type { ClosedSummary } from '../../shared/types';
import type { TrailWindow } from '../windows/browser-window';
import { workspaceMenuItems } from './workspace-menu';
import { isNavigableUrl, isPageUrl } from '../browser/url';
import { contentsForPage, pageHandleFor } from '../browser/electron-page-host';
import { editTarget, isEditingText } from './edit-history';
import { selectionTookArrow, type SelectionArrow } from './selection-keys';
import { savePage } from '../browser/save-page';

export interface MenuActions {
  /** The window menu commands act on, creating one if none is open. */
  currentWindow(): TrailWindow | null;
  openWindow(): TrailWindow;
  openSettings(): void;
  openPrivateWindow(): void;
  /** Settings at the section where other browsers' data comes in. */
  openImport(): void;
  /** Asks which local files to open, each as a new page. */
  chooseFiles(): void;
  store: TrailStore;
  preferences: PreferencesService;
}

type Appearance = typeof nativeTheme.themeSource;

/** How many recent pages and closed items the History menu lists. */
const HISTORY_MENU_LENGTH = 10;

/** Shortened for a menu; `&` would otherwise turn into a mnemonic. */
export function shorten(text: string): string {
  const short = text.length > 60 ? `${text.slice(0, 59)}…` : text;
  return short.replaceAll('&', '&&');
}

/** A visited page without a title goes by its host and path. */
export function visitLabel(match: HistoryMatch): string {
  if (match.title) return match.title;
  try {
    const url = new URL(match.url);
    return `${url.host.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return match.url;
  }
}

function closedLabel(summary: ClosedSummary): string {
  if (summary.kind === 'workspace')
    return `Workspace “${shorten(summary.label)}”`;
  if (summary.kind === 'group') return `Group “${shorten(summary.label)}”`;
  const label = shorten(summary.label);
  return summary.pageCount > 1
    ? `${label} and ${summary.pageCount - 1} more`
    : label;
}

/** Pages visited most recently, newest first, without the active one. */
export function recentHistory(
  store: Pick<TrailStore, 'frequentHistory'>,
  activeUrl: string | null | undefined,
  length = HISTORY_MENU_LENGTH,
): HistoryMatch[] {
  try {
    return store
      .frequentHistory(length + 1)
      .filter((match) => match.url !== activeUrl && isPageUrl(match.url))
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, length);
  } catch {
    return [];
  }
}

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

  const runEditCommand = async (
    command: 'undo' | 'redo',
    focusedWindow: BaseWindow | undefined,
  ) => {
    const focused = webContents.getFocusedWebContents();
    const window = actions.currentWindow();
    const target = await editTarget({
      inTrailWindow: !!window && focusedWindow === window.window,
      focus: !focused
        ? 'none'
        : focused === window?.window.webContents
          ? 'shell'
          : pageHandleFor(focused)
            ? 'page'
            : 'other',
      trailOffered: window?.trailUndoOffered ?? false,
      editingText: () =>
        focused ? isEditingText(focused) : Promise.resolve(false),
    });
    if (target === 'shell') window?.sendUiCommand({ type: command });
    // Focus stays in the page, so typing there carries on afterwards.
    else if (target === 'trail')
      window?.sendToTrail({ type: command, trail: true });
    else if (focused && !focused.isDestroyed()) focused[command]();
  };

  /**
   * ⇧⌘ and an arrow, unless it's meant for the text field that has focus. Chosen
   * from the menu with the mouse, the item always means the trail.
   */
  const trailArrow =
    (
      arrow: SelectionArrow,
      run: (controller: TrailWindow['controller']) => void,
    ) =>
    async (
      _item: unknown,
      _window: unknown,
      event: { triggeredByAccelerator?: boolean },
    ) => {
      const focused = webContents.getFocusedWebContents();
      if (
        event.triggeredByAccelerator &&
        focused &&
        (await selectionTookArrow(focused, arrow))
      ) {
        return;
      }
      const window = actions.currentWindow();
      if (window) run(window.controller);
    };

  // The menu is rebuilt when these change, so toggles name what they'll do.
  const activeWindow = actions.currentWindow();
  const activeId = activeWindow?.controller.activePageId;
  const activeSnapshot = activeWindow?.controller.snapshot();
  const activePage = activeId ? activeSnapshot?.pages[activeId] : undefined;

  const recentlyClosed =
    activeWindow?.controller.recentlyClosed().slice(0, HISTORY_MENU_LENGTH) ??
    [];
  const recentPages = recentHistory(actions.store, activePage?.url);

  // ⌘1–⌘8 pick a row of the trail, ⌘9 the last one, as in other browsers.
  const rowShortcuts: MenuItemConstructorOptions[] = Array.from(
    { length: 9 },
    (_, index) => ({
      label: index === 8 ? 'Show Last Page' : `Show Page ${index + 1}`,
      accelerator: `CmdOrCtrl+${index + 1}`,
      visible: false,
      acceleratorWorksWhenHidden: true,
      click: () =>
        actions
          .currentWindow()
          ?.controller.activateRow(index === 8 ? 'last' : index + 1),
    }),
  );

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
            window.sendUiCommand({ type: 'open-location' });
          },
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => actions.openWindow(),
        },
        {
          label: 'New Private Window',
          accelerator: 'Shift+CmdOrCtrl+N',
          click: () => actions.openPrivateWindow(),
        },
        {
          label: 'New Child Page',
          accelerator: 'Alt+CmdOrCtrl+T',
          click: withActivePage((w, id) => {
            w.controller.createChildPage(id);
            w.sendUiCommand({ type: 'open-location' });
          }),
        },
        {
          label: 'New Sibling Page',
          accelerator: 'Ctrl+CmdOrCtrl+T',
          click: withActivePage((w, id) => {
            w.controller.createSiblingPage(id);
            w.sendUiCommand({ type: 'open-location' });
          }),
        },
        {
          label: 'Duplicate Page',
          click: withActivePage((w, id) => w.controller.duplicatePage(id)),
        },
        {
          label: activePage?.isPinned ? 'Unpin Page' : 'Pin Page',
          accelerator: 'CmdOrCtrl+D',
          click: withActivePage((w, id) => {
            const page = w.controller.snapshot().pages[id];
            if (page) w.controller.setPinned(id, !page.isPinned);
          }),
        },
        {
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'open-location' }),
        },
        {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+O',
          click: () => actions.chooseFiles(),
        },
        { type: 'separator' },
        {
          label: 'Import Bookmarks and More…',
          click: () => actions.openImport(),
        },
        {
          label: 'Export Bookmarks…',
          click: () => void actions.currentWindow()?.saveBookmarks(),
        },
        {
          label: 'Export Trail…',
          enabled: Boolean(activePage),
          click: () => void actions.currentWindow()?.saveTrail(),
        },
        {
          label: 'Import Trail…',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            void window.importTrailFile();
          },
        },
        { type: 'separator' },
        {
          label: 'Copy Page Address',
          accelerator: 'Shift+CmdOrCtrl+C',
          enabled: Boolean(activePage?.url),
          click: withActivePage((w, id) => {
            const page = w.controller.snapshot().pages[id];
            if (!page?.url) return;
            clipboard.writeText(page.url);
            w.notify({
              kind: 'copied',
              what: 'link',
              subject: page.customTitle || page.title || null,
            });
          }),
        },
        {
          label: 'Copy as Markdown',
          accelerator: 'Alt+Shift+CmdOrCtrl+C',
          enabled: Boolean(activePage?.url),
          click: withActivePage((w, id) => void w.copyPageAs(id, 'markdown')),
        },
        {
          label: 'Copy as Plain Text',
          enabled: Boolean(activePage?.url),
          click: withActivePage((w, id) => void w.copyPageAs(id, 'text')),
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
            // A utility window owns its close shortcut; never close a
            // browser page behind Settings or an extension popup.
            const focused = BrowserWindow.getFocusedWindow();
            if (focused && focused !== window?.window) {
              focused.close();
              return;
            }
            if (!window) return;
            const pageId = window.controller.activePageId;
            if (pageId) window.controller.closePage(pageId);
            else window.window.close();
          },
        },
        {
          label: 'Close Branch',
          accelerator: 'Alt+CmdOrCtrl+W',
          enabled: (activePage?.childIds.length ?? 0) > 0,
          click: withActivePage((w, id) => w.controller.closeBranch(id)),
        },
        {
          label: 'Close Other Pages',
          click: withActivePage((w, id) => w.controller.closeOtherPages(id)),
        },
        {
          label: 'Close Pages Below',
          enabled:
            activeSnapshot !== undefined &&
            activePage !== undefined &&
            pagesBelow(activeSnapshot, activePage.id).length > 0,
          click: withActivePage((w, id) => w.controller.closePagesBelow(id)),
        },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
        { type: 'separator' },
        {
          label: 'Save Page As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          enabled: Boolean(activePage?.url) && !activePage?.isLoading,
          click: withActivePage((w, id) => {
            const contents = contentsForPage(id);
            if (contents)
              void savePage(w.window, contents, (filename) =>
                w.notify({ kind: 'page-saved', filename }),
              );
          }),
        },
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          enabled: Boolean(activePage?.url),
          click: withActivePage((w, id) => w.controller.print(id)),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          // Pages and other windows undo their own typing; in the shell,
          // ⌘Z also takes back trail changes and ⇧⌘Z redoes them (see
          // trail-undo.ts).
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: (_item, focusedWindow) =>
            void runEditCommand('undo', focusedWindow),
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: (_item, focusedWindow) =>
            void runEditCommand('redo', focusedWindow),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        {
          label: 'Paste and Go',
          accelerator: 'Alt+CmdOrCtrl+V',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            void window.pasteAndGo();
          },
        },
        {
          label: 'Paste Outline as Trail',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            void window.pasteOutline(null);
          },
        },
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
          label: 'Filter Pages',
          accelerator: 'Alt+CmdOrCtrl+F',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'filter-trail' }),
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+S',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'toggle-sidebar' }),
        },
        {
          label: 'Toggle AI Panel',
          accelerator: 'Shift+CmdOrCtrl+A',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'toggle-ai-panel' }),
        },
        {
          label: 'Toggle Split View',
          accelerator: 'CmdOrCtrl+\\',
          click: withActivePage((w, id) => w.controller.toggleSplit(id)),
        },
        { type: 'separator' },
        {
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: withActivePage((w, id) => w.controller.reload(id)),
        },
        {
          label: 'Reload Ignoring Cache',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: withActivePage((w, id) =>
            w.controller.reload(id, { ignoreCache: true }),
          ),
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+.',
          click: withActivePage((w, id) => w.controller.stop(id)),
        },
        { type: 'separator' },
        {
          label: 'Picture in Picture',
          accelerator: 'Alt+CmdOrCtrl+P',
          enabled: Boolean(activePage),
          click: withActivePage((w, id) => void w.togglePictureInPicture(id)),
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
          label: activePage?.isMuted ? 'Unmute Page' : 'Mute Page',
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
        {
          label: 'Next Page',
          accelerator: 'Ctrl+Tab',
          click: () => actions.currentWindow()?.controller.activateAdjacent(1),
        },
        {
          label: 'Previous Page',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => actions.currentWindow()?.controller.activateAdjacent(-1),
        },
        ...rowShortcuts,
        { type: 'separator' },
        {
          label: 'Next Trail',
          accelerator: 'Shift+CmdOrCtrl+Down',
          click: trailArrow('down', (controller) =>
            controller.activateAdjacentTrail(1),
          ),
        },
        {
          label: 'Previous Trail',
          accelerator: 'Shift+CmdOrCtrl+Up',
          click: trailArrow('up', (controller) =>
            controller.activateAdjacentTrail(-1),
          ),
        },
        {
          label: 'Collapse Branch',
          accelerator: 'Shift+CmdOrCtrl+Left',
          click: trailArrow('left', (controller) =>
            controller.stepCollapse('collapse'),
          ),
        },
        {
          label: 'Expand Branch',
          accelerator: 'Shift+CmdOrCtrl+Right',
          click: trailArrow('right', (controller) =>
            controller.stepCollapse('expand'),
          ),
        },
        {
          label: 'Collapse Other Trails',
          accelerator: 'Alt+CmdOrCtrl+C',
          enabled: Boolean(activePage),
          click: () =>
            actions.currentWindow()?.controller.collapseOtherTrails(),
        },
        {
          label: 'Where You Left Off',
          click: () =>
            actions
              .currentWindow()
              ?.sendUiCommand({ type: 'show-trail-summary' }),
        },
        { type: 'separator' },
        {
          label: 'Task Manager',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'show-tasks' }),
        },
        {
          label: 'Notes',
          accelerator: 'Alt+CmdOrCtrl+N',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'show-notes' }),
        },
        // PROTOTYPE: see src/renderer/prototype/.
        ...(app.isPackaged
          ? []
          : [
              {
                label: 'Alma View',
                accelerator: 'Alt+CmdOrCtrl+G',
                click: () =>
                  actions
                    .currentWindow()
                    ?.sendUiCommand({ type: 'show-alma-view' }),
              },
            ]),
        {
          label: 'Downloads',
          accelerator: 'Alt+CmdOrCtrl+L',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'show-downloads' }),
        },
        {
          label: 'Bookmarks',
          accelerator: 'Alt+CmdOrCtrl+B',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'show-bookmarks' }),
        },
        {
          label: actions.preferences.get().bookmarksBar
            ? 'Hide Bookmarks Bar'
            : 'Show Bookmarks Bar',
          accelerator: 'Shift+CmdOrCtrl+B',
          click: () =>
            actions.preferences.update({
              bookmarksBar: !actions.preferences.get().bookmarksBar,
            }),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Keep Window on Top',
          type: 'checkbox',
          checked: actions.currentWindow()?.window.isAlwaysOnTop() ?? false,
          click: (item) =>
            actions.currentWindow()?.window.setAlwaysOnTop(item.checked),
        },
        { type: 'separator' },
        {
          label: 'View Page Source',
          accelerator: 'Alt+CmdOrCtrl+U',
          enabled: Boolean(activePage?.url && isNavigableUrl(activePage.url)),
          click: withActivePage((w, id) => void w.controller.viewSource(id)),
        },
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
          enabled: activePage?.canGoBack ?? false,
          click: withActivePage((w, id) => w.controller.goBack(id)),
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          enabled: activePage?.canGoForward ?? false,
          click: withActivePage((w, id) => w.controller.goForward(id)),
        },
        {
          label: 'Home',
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => {
            const window = actions.currentWindow() ?? actions.openWindow();
            window.goHome();
          },
        },
        { type: 'separator' },
        {
          label: 'Show All History',
          accelerator: 'CmdOrCtrl+Y',
          click: () =>
            actions.currentWindow()?.sendUiCommand({ type: 'show-history' }),
        },
        { type: 'separator' },
        {
          label: 'Recently Closed',
          enabled: recentlyClosed.length > 0,
          submenu: recentlyClosed.map((summary) => ({
            label: closedLabel(summary),
            click: () =>
              actions.currentWindow()?.controller.reopenClosed(summary.serial),
          })),
        },
        ...(recentPages.length > 0
          ? ([
              { type: 'separator' },
              { label: 'Recently Visited', enabled: false },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        ...recentPages.map(
          (match): MenuItemConstructorOptions => ({
            label: shorten(visitLabel(match)),
            toolTip: match.url,
            click: () => {
              const window = actions.currentWindow() ?? actions.openWindow();
              window.controller.createPage({ url: match.url });
            },
          }),
        ),
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
