import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  nativeTheme,
  screen,
  session,
  type Rectangle,
} from 'electron';
import { eventChannels } from '../../shared/api';
import type { ContentInsets, UiCommand } from '../../shared/types';
import { BrowserController } from '../browser/browser-controller';
import { createElectronPageHostFactory } from '../browser/electron-page-host';
import { contentBounds } from '../browser/layout';
import type { IpcTarget } from '../ipc/register-ipc';
import { showPageMenu } from '../menus/page-menu';
import { showWorkspaceMenu } from '../menus/workspace-menu';
import { WEB_PARTITION } from '../security/web-security';
import { SessionPersister } from '../storage/session-persister';
import type { TrailStore } from '../storage/trail-store';

const BOUNDS_KEY = 'window.bounds';

export interface TrailWindowOptions {
  store: TrailStore;
  /** Called when the list of workspaces, their names or the active one changes. */
  onWorkspacesChanged(): void;
}

/** The last window position, if it still fits on a connected display. */
function savedBounds(store: TrailStore): Rectangle | null {
  try {
    const value = store.getPreference(BOUNDS_KEY);
    if (!value) return null;
    const bounds = JSON.parse(value) as Rectangle;
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    ) {
      return null;
    }
    const area = screen.getDisplayMatching(bounds).workArea;
    const visible =
      bounds.x < area.x + area.width - 100 &&
      bounds.y < area.y + area.height - 100 &&
      bounds.x + bounds.width > area.x + 100 &&
      bounds.y >= area.y - 10;
    return visible ? bounds : null;
  } catch {
    return null;
  }
}

/** Must match `--color-chrome` in the renderer's design tokens. */
const CHROME_BACKGROUND = { light: '#f3efe9', dark: '#1c1c1e' };

function chromeBackground(): string {
  return nativeTheme.shouldUseDarkColors
    ? CHROME_BACKGROUND.dark
    : CHROME_BACKGROUND.light;
}

function shellUrl(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const file = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  return pathToFileURL(file).href;
}

function isSameDocument(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    return b.protocol === 'file:'
      ? a.protocol === 'file:' && a.pathname === b.pathname
      : a.origin === b.origin;
  } catch {
    return false;
  }
}

/**
 * One browser window: the shell UI in the window's own WebContents, and the
 * page views managed by its `BrowserController` layered above it.
 */
export class TrailWindow {
  readonly window: BrowserWindow;
  readonly controller: BrowserController;
  readonly ipc: IpcTarget;
  private insets: ContentInsets | null = null;
  private readonly persister: SessionPersister;
  private workspaceKey = '';

  constructor(private readonly options: TrailWindowOptions) {
    const url = shellUrl();
    const { store } = options;
    const bounds = savedBounds(store);

    this.window = new BrowserWindow({
      ...(bounds ?? { width: 1320, height: 860 }),
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: 'Splash',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: chromeBackground(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });

    this.controller = new BrowserController({
      createHost: createElectronPageHostFactory({
        window: this.window,
        session: session.fromPartition(WEB_PARTITION),
        preload: path.join(__dirname, 'page-preload.cjs'),
      }),
      onSnapshot: (snapshot) => {
        this.send(eventChannels.snapshot, snapshot);
        this.persister.schedule();
        const key = JSON.stringify([
          snapshot.activeWorkspaceId,
          snapshot.workspaces.map((w) => [w.id, w.name]),
        ]);
        if (key !== this.workspaceKey) {
          this.workspaceKey = key;
          this.options.onWorkspacesChanged();
        }
      },
      onVisit: (visited) =>
        this.safely(() => store.recordVisit(visited, Date.now())),
      onTitle: (visited, title) =>
        this.safely(() => store.recordTitle(visited, title)),
    });

    this.persister = new SessionPersister({
      store,
      exportSession: () => this.controller.exportSession(),
      onError: (error) => console.error('Could not save the session', error),
    });
    const stored = this.safely(() => store.loadSession());
    if (stored) this.controller.restoreSession(stored);

    this.ipc = {
      isShellUrl: (candidate) => isSameDocument(candidate, url),
      invoke: {
        'browser:get-snapshot': () => this.controller.snapshot(),
        'page:create': ({ input }) => this.controller.createPage({ input }),
        'page:activate': ({ pageId }) => this.controller.activatePage(pageId),
        'page:close': ({ pageId }) => this.controller.closePage(pageId),
        'page:navigate': ({ pageId, input }) =>
          this.controller.navigate(pageId, input),
        'page:go-back': ({ pageId }) => this.controller.goBack(pageId),
        'page:go-forward': ({ pageId }) => this.controller.goForward(pageId),
        'page:reload': ({ pageId }) => this.controller.reload(pageId),
        'page:stop': ({ pageId }) => this.controller.stop(pageId),
        'page:set-collapsed': ({ pageId, collapsed }) =>
          this.controller.setCollapsed(pageId, collapsed),
        'page:create-child': ({ pageId }) =>
          this.controller.createChildPage(pageId),
        'page:close-branch': ({ pageId }) =>
          this.controller.closeBranch(pageId),
        'page:reopen-closed': () => this.controller.reopenClosed(),
        'page:move': ({ pageId, parentId, afterId }) =>
          this.controller.movePage(pageId, parentId, afterId),
        'page:rename': ({ pageId, title }) =>
          this.controller.renamePage(pageId, title),
        'page:duplicate': ({ pageId }) => this.controller.duplicatePage(pageId),
        'page:show-menu': ({ pageId }) => showPageMenu(this, pageId),
        'page:set-note': ({ pageId, note }) =>
          this.controller.setNote(pageId, note),
        'workspace:switch': ({ workspaceId }) =>
          this.controller.switchWorkspace(workspaceId),
        'workspace:rename': ({ workspaceId, name }) =>
          this.controller.renameWorkspace(workspaceId, name),
        'workspace:show-menu': () => showWorkspaceMenu(this),
      },
      send: {
        'view:set-content-insets': (insets) => {
          this.insets = insets;
          this.layout();
        },
        'view:focus-page': () => this.controller.focusActivePage(),
      },
    };

    this.lockShellNavigation(url);

    const syncBackground = () =>
      this.window.setBackgroundColor(chromeBackground());
    nativeTheme.on('updated', syncBackground);

    // Recompute in the main process so the page tracks live resizing
    // without waiting for a round trip through the shell UI.
    this.window.on('resize', () => this.layout());
    this.window.once('ready-to-show', () => this.window.show());
    // Save while every page view still exists, so their history is current.
    this.window.on('close', () => {
      this.safely(() =>
        store.setPreference(
          BOUNDS_KEY,
          JSON.stringify(this.window.getNormalBounds()),
        ),
      );
      this.persister.dispose();
    });
    this.window.on('closed', () => {
      nativeTheme.off('updated', syncBackground);
      this.controller.dispose();
    });

    void this.window.loadURL(url);
  }

  /** Writes any pending session changes now. */
  flush(): void {
    this.persister.flush();
  }

  sendUiCommand(command: UiCommand): void {
    this.window.webContents.focus();
    this.send(eventChannels.uiCommand, command);
  }

  /** Storage problems are logged; they never take the browser down. */
  private safely<T>(run: () => T): T | null {
    try {
      return run();
    } catch (error) {
      console.error('Storage error', error);
      return null;
    }
  }

  private layout(): void {
    if (!this.insets || this.window.isDestroyed()) return;
    const [width = 0, height = 0] = this.window.getContentSize();
    this.controller.setContentBounds(
      contentBounds({ width, height }, this.insets),
    );
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }

  /** The shell UI never navigates away from itself or opens windows. */
  private lockShellNavigation(url: string): void {
    const contents = this.window.webContents;
    contents.on('will-navigate', (event) => {
      if (!isSameDocument(event.url, url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
}
