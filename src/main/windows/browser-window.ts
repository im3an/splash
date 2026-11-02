import path from 'node:path';
import {
  app,
  dialog,
  BrowserWindow,
  nativeTheme,
  ShareMenu,
  net,
  shell,
  screen,
  session,
  type Rectangle,
} from 'electron';
import { eventChannels } from '../../shared/api';
import { DEFAULT_APPEARANCE, frameColor } from '../../shared/appearance';
import type { Preferences } from '../../shared/preferences';
import type {
  BrowserSnapshot,
  ContentInsets,
  Notice,
  PermissionDecision,
  StorageStatus,
  SiteInfo,
  SitePermission,
  UiCommand,
  WorkspaceAppearance,
} from '../../shared/types';
import { BrowserController } from '../browser/browser-controller';
import { buildPaletteItems, searchSuggestionItems } from '../browser/palette';
import { SearchSuggestions } from '../browser/search-suggestions';
import {
  contentsForPage,
  createElectronPageHostFactory,
  pageHandleFor,
} from '../browser/electron-page-host';
import { requestExternalOpen } from '../security/external-apps';
import { contentBounds } from '../browser/layout';
import { savePage } from '../browser/save-page';
import { OfflineRetry } from '../browser/offline-retry';
import { isSameDocument, shellUrl } from './shell-url';
import type { IpcTarget } from '../ipc/register-ipc';
import { showWorkspaceMenu } from '../menus/workspace-menu';
import {
  decisionOf,
  PERMISSION_LABELS,
  SITE_PERMISSIONS,
  webOrigin,
} from '../security/permissions';
import { WEB_PARTITION } from '../security/web-security';
import { SessionPersister } from '../storage/session-persister';
import { AiPanel } from '../ai/ai-panel';
import type { HistoryMatch, TrailStore } from '../storage/trail-store';
import type { PreferencesService } from '../preferences';
import type { DownloadManager } from '../downloads/download-manager';
import type { ContentBlocking } from '../privacy/content-blocker';
import type { ExtensionHost } from '../extensions/extension-host';

const BOUNDS_KEY = 'window.bounds';

/**
 * Asked from the default session, which holds none of the pages' cookies,
 * so the engine can't tie suggestions to a signed-in account.
 */
const engineSuggestions = new SearchSuggestions((url, init) =>
  net.fetch(url, { ...init, credentials: 'omit' }),
);

export interface TrailWindowOptions {
  store: TrailStore;
  preferences: PreferencesService;
  downloads: DownloadManager;
  blocker: ContentBlocking;
  /**
   * Called when the list of workspaces, their names or the active one
   * changes, or the active page's pin or mute, so the menu bar can follow.
   */
  onWorkspacesChanged(): void;
  openSettings(): void;
  /** Every snapshot sent to this window, for other windows that mirror it. */
  onSnapshot?(snapshot: BrowserSnapshot): void;
  /** Extensions see this window's pages as their tabs. */
  extensions: ExtensionHost | null;
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

/** What the window is called in the Window menu and Mission Control. */
function windowTitle(
  page:
    | { customTitle: string | null; title: string; url: string | null }
    | undefined,
): string {
  if (!page) return 'Splash';
  if (page.customTitle || page.title) return page.customTitle || page.title;
  try {
    return page.url ? new URL(page.url).host : 'New Page';
  } catch {
    return 'Splash';
  }
}

/** The window frame colour for a workspace's look, matching the shell. */
function chromeBackground(appearance: WorkspaceAppearance): string {
  return frameColor(appearance, nativeTheme.shouldUseDarkColors);
}

/**
 * One browser window: the shell UI in the window's own WebContents, and the
 * page views managed by its `BrowserController` layered above it.
 */
export class TrailWindow {
  readonly window: BrowserWindow;
  readonly controller: BrowserController;
  readonly ipc: IpcTarget;
  private closeApproved = false;
  /** Shell renderer crashes so far; past a few, it stops reloading. */
  private shellCrashes = 0;
  /** The shell was reloaded after a crash and hasn't reconnected yet. */
  private shellRecovering = false;
  private closePending: Promise<boolean> | null = null;
  private insets: ContentInsets | null = null;
  private readonly persister: SessionPersister;
  /** An assistant beside the page, signed in like any other page. */
  private readonly aiPanel: AiPanel;
  private workspaceKey = '';
  /** The active page's toggles the menu bar names: Pin or Unpin, Mute or Unmute. */
  private menuStateKey = '';
  /** The contents extensions were last told are in front. */
  private extensionContentsId: number | null = null;
  /** Why the last save failed, until one succeeds again. */
  private saveProblem: string | null = null;
  /** Reloads "You're offline" pages when the connection returns. */
  private readonly offline = new OfflineRetry({
    isOnline: () => net.isOnline(),
    retry: (pageId) => {
      if (this.controller.hasPage(pageId)) this.controller.reload(pageId);
    },
  });

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
        onContentsCreated: (contents) =>
          options.extensions?.addPage(contents, this.window),
        extensionMenuItems: (contents, params) =>
          options.extensions?.menuItems(contents, params) ?? [],
        openExternal: (contents, url) =>
          void requestExternalOpen(
            pageHandleFor(contents),
            contents.getURL(),
            url,
            store,
            {
              appFor: (link) => app.getApplicationNameForProtocol(link),
              open: (link) => void shell.openExternal(link),
            },
          ).catch((error: unknown) =>
            console.error('Splash could not open an external link', error),
          ),
      }),
      onSnapshot: (snapshot) => {
        this.send(eventChannels.snapshot, snapshot);
        this.selectForExtensions(snapshot.activePageId);
        this.options.onSnapshot?.(snapshot);
        this.persister.schedule();
        this.offline.update(snapshot);
        const key = JSON.stringify([
          snapshot.activeWorkspaceId,
          snapshot.workspaces.map((w) => [w.id, w.name, w.appearance]),
        ]);
        const active = snapshot.activePageId
          ? snapshot.pages[snapshot.activePageId]
          : undefined;
        if (!this.window.isDestroyed()) {
          this.window.setTitle(windowTitle(active));
        }
        // The menu names toggles and enables Back, Forward, Close Branch
        // and the History menu's lists by these.
        const menuState = JSON.stringify([
          active?.isPinned,
          active?.isLoading,
          active?.isMuted,
          active?.canGoBack,
          active?.canGoForward,
          active?.childIds.length,
          active?.url,
          snapshot.lastClosed?.serial,
        ]);
        if (key !== this.workspaceKey) {
          this.workspaceKey = key;
          this.menuStateKey = menuState;
          this.applyAppearance();
          this.options.onWorkspacesChanged();
        } else if (menuState !== this.menuStateKey) {
          this.menuStateKey = menuState;
          this.options.onWorkspacesChanged();
        }
      },
      maxLiveViews: options.preferences.get().awakePages,
      searchEngine: () => options.preferences.get().searchEngine,
      onVisit: (visited) =>
        this.safely(() => store.recordVisit(visited, Date.now())),
      onTitle: (visited, title) =>
        this.safely(() => store.recordTitle(visited, title)),
      onFavicon: (visited, faviconUrl) =>
        this.safely(() => store.recordFavicon(visited, faviconUrl)),
      onNotice: (notice) => this.notify(notice),
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
    this.aiPanel = new AiPanel({
      window: this.window,
      session: session.fromPartition(WEB_PARTITION),
      openPage: (link) => this.controller.createPage({ input: link }),
      onState: (state) => this.send(eventChannels.aiPanel, state),
    });
    const stored = this.safely(() => store.loadSession());
    if (stored) {
      this.controller.restoreSession(stored);
      if (options.preferences.get().startup === 'new-page')
        this.controller.startWithNewPage();
    }

    this.ipc = {
      isShellUrl: (candidate) => isSameDocument(candidate, url),
      invoke: {
        'browser:get-snapshot': () => {
          // The reloaded shell asks first thing: tell it what happened.
          if (this.shellRecovering) {
            this.shellRecovering = false;
            setImmediate(() => this.notify({ kind: 'shell-recovered' }));
          }
          return this.controller.snapshot();
        },
        'storage:status': () => this.storageStatus(),
        'page:create': ({ input }) => this.controller.createPage({ input }),
        'page:activate': ({ pageId }) => this.controller.activatePage(pageId),
        'page:close': ({ pageId, unpin }) =>
          this.controller.closePage(pageId, { unpin }),
        'page:navigate': ({ pageId, input }) =>
          this.controller.navigate(pageId, input),
        'page:go-back': ({ pageId }) => this.controller.goBack(pageId),
        'page:go-forward': ({ pageId }) => this.controller.goForward(pageId),
        'page:reload': ({ pageId }) => this.controller.reload(pageId),
        'page:stop': ({ pageId }) => this.controller.stop(pageId),
        'page:set-collapsed': ({ pageId, collapsed }) =>
          this.controller.setCollapsed(pageId, collapsed),
        'page:create-child': ({ pageId, input }) =>
          this.controller.createChildPage(pageId, input),
        'page:close-branch': ({ pageId }) =>
          this.controller.closeBranch(pageId),
        'page:close-others': ({ pageId }) =>
          this.controller.closeOtherPages(pageId),
        'page:print': ({ pageId }) => this.controller.print(pageId),
        'page:save-as': ({ pageId }) => {
          const contents = contentsForPage(pageId);
          if (contents)
            void savePage(this.window, contents, (filename) =>
              this.notify({ kind: 'page-saved', filename }),
            );
        },
        'workspace:delete': ({ workspaceId }) => {
          if (this.controller.snapshot().workspaces.length > 1)
            return this.controller.deleteWorkspace(workspaceId);
        },
        'page:reopen-closed': () => this.controller.reopenClosed(),
        'page:move': ({ pageId, parentId, afterId }) =>
          this.controller.movePage(pageId, parentId, afterId),
        'page:return': ({ pageId, origin }) =>
          this.controller.returnPage(pageId, origin),
        'page:rename': ({ pageId, title }) =>
          this.controller.renamePage(pageId, title),
        'page:set-pinned': ({ pageId, pinned, origin }) =>
          this.controller.setPinned(pageId, pinned, origin),
        'app:open-settings': () => this.options.openSettings(),
        'page:duplicate': ({ pageId }) => this.controller.duplicatePage(pageId),
        'page:move-to-workspace': ({ pageId, workspaceId }) =>
          this.controller.movePageToWorkspace(pageId, workspaceId),
        'page:set-note': ({ pageId, note }) =>
          this.controller.setNote(pageId, note),
        'page:open-split': ({ pageId, otherId, side }) =>
          this.controller.openSplit(pageId, otherId, side),
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
        'history:list': ({ query, limit }) => store.listHistory(query, limit),
        'history:delete': ({ url }) => {
          store.deleteHistoryEntry(url);
        },
        'history:restore': ({ entry }) => {
          store.restoreHistory([entry]);
        },
        'extensions:manage': () => {
          if (!this.options.extensions)
            throw new Error('Extensions are unavailable');
          return this.options.extensions.manage(this.window);
        },
        'page:share': ({ pageId }) => {
          const page = this.controller.snapshot().pages[pageId];
          if (page?.url && /^https?:/.test(page.url)) {
            new ShareMenu({
              urls: [page.url],
              texts: [page.customTitle ?? page.title],
            }).popup({ window: this.window });
          }
        },
        'preferences:get': () => this.options.preferences.get(),
        'preferences:update': ({ patch }) =>
          this.options.preferences.update(patch),
        'palette:query': ({ query, scope, complete }) => {
          const snapshot = this.controller.snapshot();
          const active = snapshot.activePageId
            ? snapshot.pages[snapshot.activePageId]
            : undefined;
          return buildPaletteItems({
            query,
            scope,
            pages: this.controller.listPages(),
            history: query.trim() ? this.historyPool(query) : [],
            workspaces: snapshot.workspaces,
            activeWorkspaceId: snapshot.activeWorkspaceId,
            activePageId: snapshot.activePageId,
            activePage: active && {
              id: active.id,
              url: active.url,
              pinned: active.isPinned,
              muted: active.isMuted,
              hasChildren: active.childIds.length > 0,
              hasNote: active.note !== null,
              hasOthers: Object.keys(snapshot.pages).length > 1,
              inSplit:
                snapshot.split?.leftId === active.id ||
                snapshot.split?.rightId === active.id,
            },
            canReopen: snapshot.lastClosed !== null,
            searchEngine: this.options.preferences.get().searchEngine,
            complete,
          });
        },
        'search:suggest': async ({ query }) => {
          const { searchEngine, searchSuggestions } =
            this.options.preferences.get();
          if (!searchSuggestions) return [];
          const found = await engineSuggestions.get(query, searchEngine);
          return searchSuggestionItems(found, query, searchEngine);
        },
        'workspace:move': ({ workspaceId, index }) =>
          this.controller.moveWorkspace(workspaceId, index),
        'ai:act': ({ action }) => this.aiPanel.act(action),
      },
      send: {
        'view:set-content-insets': (insets) => {
          this.insets = insets;
          this.layout();
        },
        'view:focus-page': () => this.controller.focusActivePage(),
        'view:set-overlay': ({ active }) =>
          this.controller.setOverlayActive(active),
        'ai:place': (placement) => this.aiPanel.place(placement),
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
    this.window.on('resize', () => {
      this.layout();
      this.aiPanel.layout();
    });
    // A three-finger swipe goes back or forward, as in Safari.
    this.window.on('swipe', (_event, direction) => {
      const pageId = this.controller.activePageId;
      if (!pageId) return;
      if (direction === 'right') this.controller.goBack(pageId);
      if (direction === 'left') this.controller.goForward(pageId);
    });
    // The window shows the active page's title, as in Mission Control.
    this.window.webContents.on('page-title-updated', (event) =>
      event.preventDefault(),
    );
    // Trails and pages live here in the main process, so if the shell's
    // renderer dies a reload brings everything back. After a few crashes it
    // stops, rather than loop; the window can still be closed.
    this.window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit' || this.window.isDestroyed()) return;
      console.error(`Splash shell renderer gone: ${details.reason}`);
      if (++this.shellCrashes > 3) return;
      this.shellRecovering = true;
      this.window.webContents.reload();
    });
    this.window.once('ready-to-show', () => this.window.show());
    // Save while every page view still exists, so their history is current.
    this.window.on('close', (event) => {
      if (!this.closeApproved) {
        event.preventDefault();
        void this.confirmCloseWindow()
          .then((allowed) => {
            if (allowed && !this.window.isDestroyed()) this.window.close();
          })
          .catch((error) =>
            dialog.showErrorBox('Could not close Splash', String(error)),
          );
        return;
      }
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
      this.offline.dispose();
      this.aiPanel.destroy();
      this.controller.dispose();
    });

    void this.window.loadURL(url);
  }

  /** Preserve form edits and save failures before destroying a browser window. */
  confirmCloseWindow(): Promise<boolean> {
    if (this.closeApproved || this.window.isDestroyed())
      return Promise.resolve(true);
    if (this.closePending) return this.closePending;
    this.closePending = (async () => {
      if (!(await this.controller.prepareWindowClose())) return false;
      if (!this.flush()) {
        const choice = dialog.showMessageBoxSync(this.window, {
          type: 'warning',
          message: 'Your latest changes couldn’t be saved.',
          detail:
            'Closing now loses trail changes since the last successful save. Keep this window open to retry.',
          buttons: ['Keep Window Open', 'Close Anyway'],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice === 0) {
          this.resumeAfterCanceledClose();
          return false;
        }
      }
      this.closeApproved = true;
      return true;
    })().finally(() => {
      this.closePending = null;
    });
    return this.closePending;
  }

  resumeAfterCanceledClose(): void {
    this.closeApproved = false;
    const active = this.controller.activePageId;
    if (active && this.controller.hasPage(active))
      this.controller.activatePage(active);
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

  /** Confirms something in the shell, without taking focus from the page. */
  notify(notice: Notice): void {
    this.send(eventChannels.notice, notice);
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

  /** Tells extensions when a different page comes to the front. */
  private selectForExtensions(pageId: string | null): void {
    const contents = pageId ? contentsForPage(pageId) : undefined;
    // A page that slept and woke up has new contents, so compare those.
    if (!contents || contents.id === this.extensionContentsId) return;
    // An asleep page has no contents to show; never hand over a closing one.
    if (contents.isDestroyed()) return;
    this.extensionContentsId = contents.id;
    this.options.extensions?.selectPage(contents);
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
      blockedCount: this.options.blocker.blockedOn(pageId),
      permissions: SITE_PERMISSIONS.map((permission) => {
        const decided =
          this.safely(() => store.getPermission(origin, permission)) ?? null;
        return {
          permission,
          label: PERMISSION_LABELS[permission],
          decision:
            decided === null ? this.undecided(permission) : decisionOf(decided),
        };
      }),
    };
  }

  /** What applies on a site where the user hasn't decided. */
  private undecided(permission: SitePermission): PermissionDecision {
    // Sound plays unless the user turned it off; ads follow the setting.
    if (permission === 'sound') return 'allow';
    if (permission === 'ads') {
      return this.options.preferences.get().blockAds ? 'block' : 'allow';
    }
    return 'ask';
  }

  /** Storage problems are logged; they never take the browser down. */
  /**
   * History for suggestions to rank: every visit that contains the words,
   * and the ones used most recently and most often, which a misspelling or
   * a completion may still lead to.
   */
  private historyPool(query: string): HistoryMatch[] {
    const { store } = this.options;
    const matches = this.safely(() => store.searchHistory(query, 60)) ?? [];
    const frequent = this.safely(() => store.frequentHistory(300)) ?? [];
    const byUrl = new Map(matches.map((entry) => [entry.url, entry]));
    for (const entry of frequent) {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
    }
    return [...byUrl.values()];
  }

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
      { x: 0, y: 0, width, height },
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
