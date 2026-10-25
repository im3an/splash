import path from 'node:path';
import {
  app,
  BrowserWindow,
  nativeTheme,
  shell,
  screen,
  session,
  type Rectangle,
} from 'electron';
import { eventChannels } from '../../shared/api';
import { DEFAULT_APPEARANCE, framePreset } from '../../shared/appearance';
import type { Preferences } from '../../shared/preferences';
import type {
  BrowserSnapshot,
  ContentInsets,
  StorageStatus,
  SiteInfo,
  UiCommand,
  WorkspaceAppearance,
} from '../../shared/types';
import { BrowserController } from '../browser/browser-controller';
import { buildPaletteItems } from '../browser/palette';
import { createElectronPageHostFactory } from '../browser/electron-page-host';
import { contentBounds } from '../browser/layout';
import { isSameDocument, shellUrl } from './shell-url';
import type { IpcTarget } from '../ipc/register-ipc';
import { showPageMenu } from '../menus/page-menu';
import { showWorkspaceMenu } from '../menus/workspace-menu';
import {
  decisionOf,
  PERMISSION_LABELS,
  SITE_PERMISSIONS,
  webOrigin,
} from '../security/permissions';
import { WEB_PARTITION } from '../security/web-security';
import { SessionPersister } from '../storage/session-persister';
import type { TrailStore } from '../storage/trail-store';
import type { PreferencesService } from '../preferences';
import type { DownloadManager } from '../downloads/download-manager';

const BOUNDS_KEY = 'window.bounds';

export interface TrailWindowOptions {
  store: TrailStore;
  preferences: PreferencesService;
  downloads: DownloadManager;
  /** Called when the list of workspaces, their names or the active one changes. */
  onWorkspacesChanged(): void;
  /** Every snapshot sent to this window, for other windows that mirror it. */
  onSnapshot?(snapshot: BrowserSnapshot): void;
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

/** The window frame colour for a workspace's look, matching the shell. */
function chromeBackground(appearance: WorkspaceAppearance): string {
  const frame = framePreset(appearance.frame);
  return nativeTheme.shouldUseDarkColors
    ? frame.dark.chrome
    : frame.light.chrome;
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
  /** Why the last save failed, until one succeeds again. */
  private saveProblem: string | null = null;

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
      backgroundColor: chromeBackground(DEFAULT_APPEARANCE),
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
        isSoundBlocked: (origin) =>
          this.safely(() => store.getPermission(origin, 'sound')) === false,
      }),
      onSnapshot: (snapshot) => {
        this.send(eventChannels.snapshot, snapshot);
        this.options.onSnapshot?.(snapshot);
        this.persister.schedule();
        const key = JSON.stringify([
          snapshot.activeWorkspaceId,
          snapshot.workspaces.map((w) => [w.id, w.name, w.appearance]),
        ]);
        if (key !== this.workspaceKey) {
          this.workspaceKey = key;
          this.applyAppearance();
          this.options.onWorkspacesChanged();
        }
      },
      maxLiveViews: options.preferences.get().awakePages,
      searchEngine: () => options.preferences.get().searchEngine,
      onVisit: (visited) =>
        this.safely(() => store.recordVisit(visited, Date.now())),
      onTitle: (visited, title) =>
        this.safely(() => store.recordTitle(visited, title)),
    });

    this.persister = new SessionPersister({
      store,
      exportSession: () => this.controller.exportSession(),
      onError: (error) => {
        console.error('Could not save the session', error);
        this.saveProblem =
          error instanceof Error ? error.message : String(error);
        this.send(eventChannels.storage, this.storageStatus());
      },
      onSaved: () => {
        if (this.saveProblem === null) return;
        this.saveProblem = null;
        this.send(eventChannels.storage, this.storageStatus());
      },
    });
    const stored = this.safely(() => store.loadSession());
    if (stored) this.controller.restoreSession(stored);

    this.ipc = {
      isShellUrl: (candidate) => isSameDocument(candidate, url),
      invoke: {
        'browser:get-snapshot': () => this.controller.snapshot(),
        'storage:status': () => this.storageStatus(),
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
        'page:open-split': ({ pageId, otherId }) =>
          this.controller.openSplit(pageId, otherId),
        'page:toggle-split': ({ pageId }) =>
          this.controller.toggleSplit(pageId),
        'split:close': () => this.controller.closeSplit(),
        'workspace:switch': ({ workspaceId }) =>
          this.controller.switchWorkspace(workspaceId),
        'workspace:rename': ({ workspaceId, name }) =>
          this.controller.renameWorkspace(workspaceId, name),
        'workspace:show-menu': () => showWorkspaceMenu(this),
        'workspace:create': ({ name, appearance }) =>
          this.controller.createWorkspace(name, appearance),
        'workspace:customize': ({ workspaceId, name, appearance }) =>
          this.controller.customizeWorkspace(workspaceId, name, appearance),
        'page:set-muted': ({ pageId, muted }) =>
          this.controller.setMuted(pageId, muted),
        'page:zoom': ({ pageId, direction }) =>
          this.controller.zoom(pageId, direction),
        'page:find': ({ pageId, text, forward, findNext }) =>
          this.controller.find(pageId, text, { forward, findNext }),
        'page:stop-find': ({ pageId }) => this.controller.stopFind(pageId),
        'page:respond-permission': ({ pageId, requestId, granted }) =>
          this.controller.respondToPermission(pageId, requestId, granted),
        'site:get-info': ({ pageId }) => this.siteInfo(pageId),
        'site:set-permission': ({ origin, permission, decision }) => {
          store.setPermission(
            origin,
            permission,
            decision === 'ask' ? null : decision === 'allow',
          );
          if (permission === 'sound') {
            this.controller.applySoundPolicy(origin, decision === 'block');
          }
        },
        'site:reset': ({ origin }) => {
          store.clearPermissions(origin);
          this.controller.applySoundPolicy(origin, false);
        },
        'view:freeze': () => this.controller.captureVisiblePages(),
        'downloads:list': () => this.options.downloads.list(),
        'downloads:act': ({ id, action }) =>
          this.options.downloads.act(id, action),
        'downloads:clear': () => this.options.downloads.clearFinished(),
        'downloads:open-folder': () => {
          void shell.openPath(app.getPath('downloads'));
        },
        'preferences:get': () => this.options.preferences.get(),
        'preferences:update': ({ patch }) =>
          this.options.preferences.update(patch),
        'palette:query': ({ query, scope }) => {
          const snapshot = this.controller.snapshot();
          return buildPaletteItems({
            query,
            scope,
            pages: this.controller.listPages(),
            history: query.trim()
              ? (this.safely(() => store.searchHistory(query, 12)) ?? [])
              : [],
            activeWorkspaceId: snapshot.activeWorkspaceId,
            activePageId: snapshot.activePageId,
            searchEngine: this.options.preferences.get().searchEngine,
          });
        },
        'workspace:move': ({ workspaceId, index }) =>
          this.controller.moveWorkspace(workspaceId, index),
      },
      send: {
        'view:set-content-insets': (insets) => {
          this.insets = insets;
          this.layout();
        },
        'view:focus-page': () => this.controller.focusActivePage(),
        'view:set-overlay': ({ active }) =>
          this.controller.setOverlayActive(active),
      },
    };

    this.lockShellNavigation(url);

    const syncBackground = () =>
      this.window.setBackgroundColor(
        chromeBackground(this.controller.activeAppearance),
      );
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

  /** Writes any pending session changes now; false if that failed. */
  flush(): boolean {
    return this.persister.flush();
  }

  storageStatus(): StorageStatus {
    return { problem: this.saveProblem };
  }

  /** Tells the shell the downloads list changed. */
  sendDownloads(): void {
    this.send(eventChannels.downloads, this.options.downloads.list());
  }

  /** Applies changed app-wide settings to this window. */
  applyPreferences(preferences: Preferences): void {
    this.controller.setMaxLiveViews(preferences.awakePages);
    this.applyAppearance();
    this.send(eventChannels.preferences, preferences);
  }

  sendUiCommand(command: UiCommand): void {
    this.window.webContents.focus();
    this.send(eventChannels.uiCommand, command);
  }

  /**
   * A workspace can insist on light or dark; otherwise the app-wide choice
   * applies. The window frame takes the workspace's frame colour.
   */
  applyAppearance(): void {
    const { mode } = this.controller.activeAppearance;
    const source =
      mode !== 'system' ? mode : this.options.preferences.get().theme;
    if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
    if (!this.window.isDestroyed()) {
      this.window.setBackgroundColor(
        chromeBackground(this.controller.activeAppearance),
      );
    }
  }

  /** Connection and permission details for the page's site. */
  private siteInfo(pageId: string): SiteInfo | null {
    const page = this.controller.snapshot().pages[pageId];
    const origin = webOrigin(page?.url ?? undefined);
    if (!origin) return null;
    const { store } = this.options;
    return {
      origin,
      host: new URL(origin).host,
      security: origin.startsWith('https:') ? 'secure' : 'insecure',
      permissions: SITE_PERMISSIONS.map((permission) => {
        const decided = this.safely(() =>
          store.getPermission(origin, permission),
        );
        return {
          permission,
          label: PERMISSION_LABELS[permission],
          // Sound plays unless the user turned it off.
          decision:
            permission === 'sound' && decided === null
              ? 'allow'
              : decisionOf(decided ?? null),
        };
      }),
    };
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
