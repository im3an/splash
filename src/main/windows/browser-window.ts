import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  hasCertificateException,
  type CertificateExceptions,
} from '../security/certificate-exceptions';
import {
  app,
  dialog,
  BrowserWindow,
  clipboard,
  Menu,
  nativeTheme,
  ShareMenu,
  net,
  shell,
  screen,
  type Rectangle,
  type Session,
} from 'electron';
import { eventChannels } from '../../shared/api';
import { DEFAULT_APPEARANCE, frameColor } from '../../shared/appearance';
import type { Preferences } from '../../shared/preferences';
import type { CredentialPrompt } from '../../shared/vault';
import {
  builtInEngine,
  fillSearchUrl,
  keywordSearch,
} from '../../shared/search';
import { formatPageLink, type CopyFormat } from '../../shared/page-link';
import { pagesBelow } from '../../shared/pages-below';
import type {
  BrowserSnapshot,
  ContentInsets,
  SettingsSection,
  Notice,
  PageId,
  PermissionDecision,
  StorageStatus,
  SiteInfo,
  SitePermission,
  TaskList,
  UiCommand,
  WorkspaceAppearance,
  WorkspaceId,
  WorkspaceMode,
} from '../../shared/types';
import {
  BrowserController,
  type SharedTrails,
} from '../browser/browser-controller';
import { buildPaletteItems, searchSuggestionItems } from '../browser/palette';
import { allowLocalFile, clipboardAddressInput } from '../browser/url';
import { SearchSuggestions } from '../browser/search-suggestions';
import { pageWebPreferences } from '../browser/page-preferences';
import { rememberZoom, zoomFor } from '../browser/site-zoom';
import { SiteIcons } from '../browser/site-icons';
import {
  contentsForPage,
  createElectronPageHostFactory,
  pageHandleFor,
} from '../browser/electron-page-host';
import { togglePictureInPicture } from '../browser/picture-in-picture';
import { toggleReaderIn } from '../browser/reader';
import {
  chooseTrailFile,
  exportBookmarks,
  exportTrail,
  trailFile,
} from '../transfer/transfer-dialogs';
import { parseTrailOutline } from '../transfer/trail-markdown';
import { setDictionaryWord } from '../spelling';
import { requestExternalOpen } from '../security/external-apps';
import { contentBounds } from '../browser/layout';
import { wwwSibling } from '../security/https-only';
import { savePage } from '../browser/save-page';
import { OfflineRetry } from '../browser/offline-retry';
import { isSameDocument, shellUrl } from './shell-url';
import type { IpcTarget } from '../ipc/register-ipc';
import { addressMenuItems } from '../menus/address-menu';
import { showWorkspaceMenu } from '../menus/workspace-menu';
import {
  decisionOf,
  PERMISSION_LABELS,
  SITE_PERMISSIONS,
  systemSettingsUrl,
  webOrigin,
} from '../security/permissions';
import { dangerousSiteKey } from '../security/threat-list';
import { AiPanel } from '../ai/ai-panel';
import { NotesStore } from '../notes/notes-store';
import type { PageHostFactory } from '../browser/page-host';
import type { HistoryMatch, TrailStore } from '../storage/trail-store';
import type { PreferencesService } from '../preferences';
import type { DownloadManager } from '../downloads/download-manager';
import type { AdsOnPage, ContentBlocking } from '../privacy/content-blocker';
import type { CookieViewer } from '../privacy/cookies';
import type { ExtensionHost } from '../extensions/extension-host';

/** The most pages one import brings in. */
const MAX_OUTLINE_PAGES = 500;
/** How long a dragged-out trail's file stays for the app it was dropped on. */
const TRAIL_DRAG_FILE_MS = 60_000;

const BOUNDS_KEY = 'window.bounds';

/**
 * Asked from the default session, which holds none of the pages' cookies,
 * so the engine can't tie suggestions to a signed-in account.
 */
const engineSuggestions = new SearchSuggestions((url, init) =>
  net.fetch(url, { ...init, credentials: 'omit' }),
);

const siteIcons = new SiteIcons((url, init) =>
  net.fetch(url, { ...init, credentials: 'omit' }),
);

let sharedNotes: NotesStore | null = null;
/** One notes file for every window, private ones included: notes are yours. */
function notesStore(): NotesStore {
  sharedNotes ??= new NotesStore(
    path.join(app.getPath('userData'), 'notes.json'),
  );
  return sharedNotes;
}

export interface SessionSaves {
  schedule(): void;
  /** Writes pending changes now; false if that failed. */
  flush(): boolean;
  /** Why the last save failed, until one succeeds again. */
  problem(): string | null;
}

/** A workspace's profile, as a window's pages and popovers use it. */
export interface WindowProfile {
  /** Names the profile; workspaces with the same key share everything. */
  key: string;
  /** Where the workspace's pages keep their cookies and storage. */
  session: Session;
  /** Its history and site decisions; everything else in it is shared. */
  store: TrailStore;
  cookies: CookieViewer;
}

export interface TrailWindowOptions {
  certificates: CertificateExceptions;
  /** The profile a workspace's pages browse in; a private window has one. */
  profileFor(workspaceId: WorkspaceId): WindowProfile;
  /** The key of that profile, without opening it. */
  profileKeyOf(workspaceId: WorkspaceId): string;
  /**
   * Asks before a workspace goes with its sign-ins and history, then lets
   * its profile go. Absent for private windows, where everything goes anyway.
   */
  confirmDeleteWorkspace?(name: string): Promise<boolean>;
  /** A deleted workspace's profile can be cleared. */
  forgetWorkspace?(workspaceId: WorkspaceId): void;
  /** Nothing outlives its windows: no saved session, history or new logins. */
  isPrivate: boolean;
  openSettingsSection(section: SettingsSection): void;
  openPrivateWindow(): void;
  /** True once, when it's time to offer being the default browser. */
  offerDefaultBrowser(): boolean;
  makeDefaultBrowser(): void;
  chooseFiles(): void;
  /** Files dragged from the Finder onto this window. */
  openFiles(paths: string[]): void;
  answerCredentialPrompt(
    id: string,
    answer: 'save' | 'never' | 'dismiss',
  ): void;
  store: TrailStore;
  preferences: PreferencesService;
  downloads: DownloadManager;
  blocker: ContentBlocking;
  /**
   * Called when the list of workspaces, their names or the active one
   * changes, or the active page's pin or mute, so the menu bar can follow.
   */
  onWorkspacesChanged(): void;
  openSettings(section?: string): void;
  /** What's running in every window, for the task manager. */
  listTasks(): TaskList;
  /** The trails every window shows. */
  trails: SharedTrails;
  /** Saves the trails; there's one of these for all windows. */
  saves: SessionSaves;
  /** Where to open; on top of the last window's place by default. */
  bounds?: Rectangle;
  /** What this window opens with; otherwise what `startWindow` picks. */
  show?: { pageId: PageId } | { url: string };
  /** Opens another window to show this page. */
  openPageInNewWindow(pageId: PageId): void;
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
    return visibleBounds(JSON.parse(value) as Rectangle);
  } catch {
    return null;
  }
}

/** A saved position, if it still fits on a connected display. */
export function visibleBounds(bounds: Rectangle): Rectangle | null {
  try {
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
  isPrivate: boolean,
): string {
  const title = pageTitle(page);
  return isPrivate ? `${title} (Private)` : title;
}

function pageTitle(
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

function appliedZoomKey({ defaultZoom, siteZoom }: Preferences): string {
  return JSON.stringify([defaultZoom, siteZoom]);
}

function appliedViewKey(preferences: Preferences): string {
  return JSON.stringify(pageWebPreferences(preferences));
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
  /** The light or dark the workspace editor is showing, while it's open. */
  private previewMode: WorkspaceMode | null = null;
  /** A toast with Undo or Redo is showing, so ⌘Z and ⇧⌘Z mean the trail. */
  trailUndoOffered = false;
  /** An assistant beside the page, signed in like any other page. */
  private readonly aiPanel: AiPanel;
  private workspaceKey = '';
  /** The active page's toggles the menu bar names: Pin or Unpin, Mute or Unmute. */
  private menuStateKey = '';
  /** What's in force, so an unrelated settings change touches no page. */
  private appliedZoom: string;
  private appliedView: string;
  /** The contents extensions were last told are in front. */
  private extensionContentsId: number | null = null;
  /** Reloads "You're offline" pages when the connection returns. */
  /** The store this window reads, which a private window keeps in memory. */
  get store(): TrailStore {
    return this.options.store;
  }

  /** The profile of the workspace in front, for its history and sites. */
  get activeProfile(): WindowProfile {
    return this.options.profileFor(this.controller.currentWorkspaceId);
  }

  /**
   * Deletes a workspace once the user agrees that its sign-ins, site data
   * and history go with it. Reopening it brings its pages back, signed out.
   */
  async deleteWorkspace(workspaceId: WorkspaceId): Promise<void> {
    const workspace = this.controller
      .snapshot()
      .workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace || this.controller.snapshot().workspaces.length < 2) return;
    const { confirmDeleteWorkspace, forgetWorkspace } = this.options;
    if (
      confirmDeleteWorkspace &&
      !(await confirmDeleteWorkspace(workspace.name))
    )
      return;
    if (this.window.isDestroyed()) return;
    await this.controller.deleteWorkspace(workspaceId);
    const gone = !this.controller
      .snapshot()
      .workspaces.some((candidate) => candidate.id === workspaceId);
    if (gone) forgetWorkspace?.(workspaceId);
  }

  get isPrivate(): boolean {
    return this.options.isPrivate;
  }

  /** Shows or withdraws the offer to keep a login, if it's this window's. */
  sendCredentialPrompt(prompt: CredentialPrompt | null): void {
    this.send(eventChannels.credentialPrompt, prompt);
  }

  private readonly offline = new OfflineRetry({
    isOnline: () => net.isOnline(),
    retry: (pageId) => {
      if (this.controller.hasPage(pageId)) this.controller.reload(pageId);
    },
  });

  constructor(private readonly options: TrailWindowOptions) {
    const url = shellUrl();
    const { store } = options;
    const bounds = options.bounds ?? savedBounds(store);
    this.appliedZoom = appliedZoomKey(options.preferences.get());
    this.appliedView = appliedViewKey(options.preferences.get());

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
      trails: options.trails,
      site: this.window,
      focusWindow: () => this.window.focus(),
      createHost: (events) =>
        this.hostFactoryFor(options.profileFor(events.workspaceId))(events),
      onSnapshot: (snapshot) => {
        this.send(eventChannels.snapshot, snapshot);
        this.selectForExtensions(snapshot.activePageId);
        this.options.onSnapshot?.(snapshot);
        options.saves.schedule();
        this.offline.update(snapshot);
        const key = JSON.stringify([
          snapshot.activeWorkspaceId,
          snapshot.workspaces.map((w) => [w.id, w.name, w.appearance]),
        ]);
        const active = snapshot.activePageId
          ? snapshot.pages[snapshot.activePageId]
          : undefined;
        if (!this.window.isDestroyed()) {
          this.window.setTitle(windowTitle(active, options.isPrivate));
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
          active && pagesBelow(snapshot, active.id).length,
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
      defaultZoom: () => options.preferences.get().defaultZoom,
      search: () => options.preferences.get(),
      // Asked from the page in front, so its workspace's profile decides.
      allowPlainHttp: (address) => {
        this.safely(() =>
          this.activeProfile.store.setPermission(
            new URL(address).origin,
            'insecure',
            true,
          ),
        );
      },
      allowDangerousSite: (address) => {
        const key = dangerousSiteKey(address);
        if (key) {
          this.safely(() =>
            this.activeProfile.store.setPermission(key, 'dangerous', true),
          );
        }
      },
      allowCertificate: (address) => {
        this.safely(() =>
          options.certificates.accept(this.activeProfile.store, address),
        );
      },

      newPageUrl: () => {
        const { newPage, homepage } = options.preferences.get();
        return newPage === 'homepage' ? homepage : null;
      },
      profileOf: (workspaceId) => options.profileKeyOf(workspaceId),
      onVisit: (visited, workspaceId) =>
        this.safely(() =>
          options
            .profileFor(workspaceId)
            .store.recordVisit(visited, Date.now()),
        ),
      onTitle: (visited, title, workspaceId) =>
        this.safely(() =>
          options.profileFor(workspaceId).store.recordTitle(visited, title),
        ),
      onFavicon: (visited, faviconUrl, workspaceId) =>
        this.safely(() =>
          options
            .profileFor(workspaceId)
            .store.recordFavicon(visited, faviconUrl),
        ),
      onNotice: (notice) => this.notify(notice),
    });

    // Asked when the panel opens a view, so it signs in as the workspace in
    // front does, and never during startup, before the saved workspaces are
    // back (the controller starts with a placeholder workspace).
    const activeSession = () => this.activeProfile.session;
    this.aiPanel = new AiPanel({
      window: this.window,
      get session() {
        return activeSession();
      },
      openPage: (link) => this.controller.createPage({ input: link }),
      onState: (state) => this.send(eventChannels.aiPanel, state),
    });
    const joining = options.trails.loaded;
    if (!joining) {
      options.trails.loaded = true;
      const stored = this.safely(() => store.loadSession());
      if (stored) {
        this.controller.restoreSession(stored);
        if (options.preferences.get().startup === 'new-page')
          this.controller.startWithNewPage();
      }
      if (!options.isPrivate) this.adoptSavedGroups(store);
    }
    if (options.show && 'pageId' in options.show) {
      this.controller.activatePage(options.show.pageId);
    } else if (options.show) {
      this.controller.createPage({ url: options.show.url });
    } else if (joining) {
      this.controller.startWindow();
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
          const comeBack = options.isPrivate
            ? null
            : this.controller.takeComeBack();
          if (comeBack) setImmediate(() => this.notify(comeBack));
          // One question at a time: the offer waits for a quieter launch.
          else if (!options.isPrivate && options.offerDefaultBrowser())
            setImmediate(() => this.notify({ kind: 'default-browser-offer' }));
          return this.controller.snapshot();
        },
        'storage:status': () => this.storageStatus(),
        'window:info': () => ({ isPrivate: options.isPrivate }),
        'window:new-private': () => {
          options.openPrivateWindow();
        },
        'app:make-default-browser': () => options.makeDefaultBrowser(),
        'file:choose': () => options.chooseFiles(),
        'file:open-dropped': ({ paths }) => options.openFiles(paths),
        'app:open-settings-section': ({ section }) =>
          options.openSettingsSection(section),
        'credential:respond': ({ id, answer }) =>
          options.answerCredentialPrompt(id, answer),
        'transfer:export-bookmarks': () => this.saveBookmarks(),
        'transfer:export-trail': () => this.saveTrail(),
        'page:picture-in-picture': ({ pageId }) =>
          this.togglePictureInPicture(pageId),
        'page:create': ({ input }) => this.controller.createPage({ input }),
        'page:activate': ({ pageId }) => this.controller.activatePage(pageId),
        'page:close': ({ pageId, unpin }) =>
          this.controller.closePage(pageId, { unpin }),
        'page:navigate': ({ pageId, input }) =>
          this.controller.navigate(pageId, input),
        'page:go-back': ({ pageId }) => this.controller.goBack(pageId),
        'page:go-forward': ({ pageId }) => this.controller.goForward(pageId),
        'page:reload': ({ pageId }) => this.controller.reload(pageId),
        'page:continue-over-http': ({ pageId }) =>
          this.controller.continueOverHttp(pageId),
        'page:continue-to-dangerous-site': ({ pageId }) =>
          this.controller.continueToDangerousSite(pageId),
        'page:continue-past-certificate': ({ pageId }) =>
          this.controller.continuePastCertificate(pageId),
        'page:stop': ({ pageId }) => this.controller.stop(pageId),
        'page:set-collapsed': ({ pageId, collapsed }) =>
          this.controller.setCollapsed(pageId, collapsed),
        'page:create-child': ({ pageId, input }) =>
          this.controller.createChildPage(pageId, input),
        'page:create-sibling': ({ pageId, input }) =>
          this.controller.createSiblingPage(pageId, input),
        'page:set-emoji': ({ pageId, emoji }) =>
          this.controller.setEmoji(pageId, emoji),
        'trail:collapse-others': ({ pageId }) =>
          this.controller.collapseOtherTrails(pageId),
        'trail:set-collapsed': ({ pageIds, groupIds, collapsed }) =>
          this.controller.setTrailsCollapsed(pageIds, groupIds, collapsed),
        'trail:import-file': () => this.importTrailFile(),
        'trail:paste-outline': ({ parentId }) => this.pasteOutline(parentId),
        'trail:undo-import': ({ pageIds, groupId }) =>
          this.controller.undoImport(pageIds, groupId),
        'trail:drag-out': (target) => this.dragTrailOut(target),
        'page:close-branch': ({ pageId }) =>
          this.controller.closeBranch(pageId),
        'page:close-others': ({ pageId }) =>
          this.controller.closeOtherPages(pageId),
        'page:close-below': ({ pageId }) =>
          this.controller.closePagesBelow(pageId),
        'trail:clear-loose': () => this.controller.clearLoosePages(),
        'window:toggle-full-screen': () =>
          this.window.setFullScreen(!this.window.isFullScreen()),
        'spelling:set-word': ({ word, known }) =>
          setDictionaryWord(this.activeProfile.session, word, known),
        'page:view-source': ({ pageId }) => this.controller.viewSource(pageId),
        'page:toggle-devtools': ({ pageId }) =>
          this.controller.toggleDevTools(pageId),
        'page:print': ({ pageId }) => this.controller.print(pageId),
        'page:save-as': ({ pageId }) => {
          const contents = contentsForPage(pageId);
          if (contents)
            void savePage(this.window, contents, (filename) =>
              this.notify({ kind: 'page-saved', filename }),
            );
        },
        'workspace:delete': ({ workspaceId }) =>
          this.deleteWorkspace(workspaceId),
        'page:reopen-closed': () => this.controller.reopenClosed(),
        'page:reopen-closed-item': ({ serial }) =>
          this.controller.reopenClosed(serial),
        'page:recently-closed': () => this.controller.recentlyClosed(),
        'page:undo-close': ({ serial }) => this.controller.undoClose(serial),
        'page:close-again': ({ serial }) => this.controller.closeAgain(serial),
        'page:move': ({ pageId, parentId, afterId, groupId }) =>
          this.controller.movePage(pageId, parentId, afterId, groupId),
        'page:return': ({ pageId, origin }) =>
          this.controller.returnPage(pageId, origin),
        'page:rename': ({ pageId, title }) =>
          this.controller.renamePage(pageId, title),
        'page:set-pinned': ({ pageId, pinned, origin }) =>
          this.controller.setPinned(pageId, pinned, origin),
        'group:create': ({ name, pageId }) =>
          this.controller.createGroup(name, pageId),
        'group:rename': ({ groupId, name }) =>
          this.controller.renameGroup(groupId, name),
        'group:set-collapsed': ({ groupId, collapsed }) =>
          this.controller.setGroupCollapsed(groupId, collapsed),
        'group:set-icon': ({ groupId, icon }) =>
          this.controller.setGroupIcon(groupId, icon),
        'group:delete': ({ groupId }) => this.controller.deleteGroup(groupId),
        'group:delete-with-pages': ({ groupId }) =>
          this.controller.deleteGroupWithPages(groupId),
        'page:set-group': ({ pageId, groupId }) =>
          this.controller.setPageGroup(pageId, groupId),
        'app:open-settings': () => this.options.openSettings(),
        'page:duplicate': ({ pageId }) => this.controller.duplicatePage(pageId),
        'page:move-to-workspace': ({ pageId, workspaceId }) =>
          this.controller.movePageToWorkspace(pageId, workspaceId),
        'page:move-to-window': ({ pageId, windowId }) => {
          if (windowId !== null) {
            return this.controller.moveToWindow(pageId, windowId);
          }
          this.controller.stepAwayFrom(pageId);
          options.openPageInNewWindow(pageId);
        },
        'page:set-note': ({ pageId, note }) =>
          this.controller.setNote(pageId, note),
        'notes:list': () => notesStore().list(),
        'notes:save': (input) => notesStore().save(input),
        'notes:delete': ({ id }) => notesStore().delete(id),
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
        'page:open-blocked-popup': ({ pageId, url }) =>
          this.controller.openBlockedPopup(pageId, url),
        'site:get-info': async ({ pageId }) => {
          const origin = webOrigin(
            this.controller.snapshot().pages[pageId]?.url ?? undefined,
          );
          if (!origin) return null;
          // uBlock Origin's own count and trusted list, in the page's session.
          const ads = await this.options.blocker.adsOn(pageId, origin);
          return this.siteInfo(pageId, ads);
        },
        'system:open-permission-settings': ({ permission }) =>
          shell.openExternal(systemSettingsUrl(permission)),
        'site:set-permission': ({ origin, permission, decision }) => {
          // uBlock Origin keeps which sites are trusted, so its popup and
          // dashboard agree with Splash.
          if (permission === 'ads') {
            return this.options.blocker.setAdsAllowed(
              this.activeProfile.session,
              origin,
              decision === 'allow',
            );
          }
          this.activeProfile.store.setPermission(
            origin,
            permission,
            decision === 'ask' ? null : decision === 'allow',
          );
          if (permission === 'sound') {
            this.controller.applySoundPolicy(origin, decision === 'block');
          }
          if (permission === 'popups' && decision === 'allow') {
            this.controller.clearBlockedPopups(origin);
          }
          // A service worker answers without the network, past the rule that
          // keeps scripts and images off the site's pages.
          if (
            (permission === 'javascript' || permission === 'images') &&
            decision === 'block'
          ) {
            void this.activeProfile.session
              .clearData({ dataTypes: ['serviceWorkers'], origins: [origin] })
              .catch((error: unknown) =>
                console.error('Could not clear service workers', error),
              );
          }
        },
        'cookies:list': ({ host }) => this.activeProfile.cookies.list(host),
        'cookies:delete': ({ site, only }) =>
          this.activeProfile.cookies.delete(site, only),
        'cookies:undo': ({ token }) =>
          this.activeProfile.cookies.restore(token),
        'site:reset': async ({ origin }) => {
          this.activeProfile.store.clearPermissions(origin);
          this.controller.applySoundPolicy(origin, false);
          await this.options.blocker.setAdsAllowed(
            this.activeProfile.session,
            origin,
            false,
          );
        },
        'view:freeze': () => this.controller.captureVisiblePages(),
        'tasks:list': () => this.options.listTasks(),
        'tasks:end': ({ pageId }) => {
          // Reload brings it back; the page shows that it was stopped.
          contentsForPage(pageId)?.forcefullyCrashRenderer();
        },
        'downloads:list': () => this.options.downloads.list(),
        'downloads:act': ({ id, action }) =>
          this.options.downloads.act(id, action),
        'downloads:clear': () => this.options.downloads.clearFinished(),
        'downloads:open-folder': () => {
          void shell.openPath(app.getPath('downloads'));
        },
        // History is the workspace's own, like its sign-ins.
        'history:list': ({ query, limit }) =>
          this.activeProfile.store.listHistory(query, limit),
        'history:delete': ({ url }) => {
          this.activeProfile.store.deleteHistoryEntry(url);
        },
        'history:restore': ({ entry }) => {
          this.activeProfile.store.restoreHistory([entry]);
        },
        'extensions:manage': () => this.options.openSettings('extensions'),
        // The toolbar's Extensions popover: the same controls as Settings.
        'extensions:list': () => this.options.extensions?.list() ?? [],
        'extensions:set-enabled': ({ id, enabled }) =>
          this.extensionHost().setEnabled(id, enabled),
        'extensions:remove': ({ id }) => this.extensionHost().remove(id),
        'extensions:open-store': () => this.extensionHost().openWebStore(),
        'extensions:open-page': ({ url }) => this.extensionHost().openPage(url),
        'extensions:load-unpacked': () =>
          this.extensionHost().loadUnpacked(this.window),
        'page:share': ({ pageId }) => {
          const page = this.controller.snapshot().pages[pageId];
          if (page?.url && /^https?:/.test(page.url)) {
            new ShareMenu({
              urls: [page.url],
              texts: [page.customTitle ?? page.title],
            }).popup({ window: this.window });
          }
        },
        'page:copy-as': ({ pageId, format }) => this.copyPageAs(pageId, format),
        'page:paste-and-go': () => this.pasteAndGo(),
        'page:go-home': () => this.goHome(),
        'address:show-menu': () => {
          const { activePageId, pages } = this.controller.snapshot();
          const pageId = activePageId;
          Menu.buildFromTemplate(
            addressMenuItems({
              hasAddress: pageId !== null && Boolean(pages[pageId]?.url),
              pasteAndGo: () => void this.pasteAndGo(),
              copyAs: (format) => {
                if (pageId) void this.copyPageAs(pageId, format);
              },
            }),
          ).popup({ window: this.window });
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
            collections: this.options.preferences.get().collections,
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
              hasBelow: pagesBelow(snapshot, active.id).length > 0,
              inSplit:
                snapshot.split?.leftId === active.id ||
                snapshot.split?.rightId === active.id,
            },
            canReopen: snapshot.lastClosed !== null,
            search: this.options.preferences.get(),
            hasHomepage: this.options.preferences.get().homepage !== null,
            complete,
          });
        },
        'search:suggest': async ({ query }) => {
          const preferences = this.options.preferences.get();
          // Only the built-in engines are asked, and a shortcut's search
          // ("yt cats") isn't for the default engine to see.
          const engine = builtInEngine(preferences.searchEngine);
          if (
            !preferences.searchSuggestions ||
            !engine ||
            keywordSearch(query, preferences.searchShortcuts)
          )
            return [];
          const found = await engineSuggestions.get(query, engine.id);
          return searchSuggestionItems(found, query, preferences);
        },
        'search:site-icon': ({ url }) =>
          siteIcons.get(new URL(fillSearchUrl(url, '')).origin),
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
        // With the address bar in the sidebar and the sidebar shut, nothing
        // sits above the page, so the buttons would cover it.
        'view:set-window-buttons': ({ visible }) => {
          this.window.setWindowButtonVisibility(visible);
          // Shown again, macOS puts them back at its own spot.
          if (visible) this.window.setWindowButtonPosition({ x: 18, y: 18 });
        },
        'view:set-trail-undo-offered': ({ offered }) => {
          this.trailUndoOffered = offered;
        },
        'workspace:preview-mode': ({ mode }) => {
          this.previewMode = mode;
          this.applyAppearance();
        },
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
    // A three-finger swipe goes back or forward, as in Safari, and down
    // reloads. macOS only sends these when Trackpad settings leave three
    // fingers free: not with three-finger drag, Mission Control or App Exposé.
    this.window.on('swipe', (_event, direction) => {
      const pageId = this.controller.activePageId;
      if (!pageId || !options.preferences.get().trackpadSwipes) return;
      if (direction === 'right') this.controller.goBack(pageId);
      if (direction === 'left') this.controller.goForward(pageId);
      if (direction === 'down') this.controller.reload(pageId);
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
      options.saves.flush();
    });
    this.window.on('focus', () => this.controller.becomeLead());
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
      this.controller.activatePage(active, { steal: false });
  }

  /** Writes any pending session changes now; false if that failed. */
  flush(): boolean {
    return this.options.saves.flush();
  }

  storageStatus(): StorageStatus {
    return { problem: this.options.saves.problem() };
  }

  /** Tells the shell whether saving works. */
  sendStorage(): void {
    this.send(eventChannels.storage, this.storageStatus());
  }

  /** Tells the shell which extensions there are, on or off. */
  sendExtensions(): void {
    this.send(eventChannels.extensions, this.options.extensions?.list() ?? []);
  }

  private extensionHost(): ExtensionHost {
    const host = this.options.extensions;
    if (!host) throw new Error('Extensions are unavailable');
    return host;
  }

  /** Tells the shell the downloads list changed. */
  sendDownloads(): void {
    this.send(eventChannels.downloads, this.options.downloads.list());
  }

  /** Applies changed app-wide settings to this window. */
  applyPreferences(preferences: Preferences): void {
    this.controller.setMaxLiveViews(preferences.awakePages);
    const zoom = appliedZoomKey(preferences);
    if (zoom !== this.appliedZoom) {
      this.appliedZoom = zoom;
      this.controller.applyZoomSettings();
    }
    const view = appliedViewKey(preferences);
    if (view !== this.appliedView) {
      this.appliedView = view;
      this.controller.rebuildViews();
    }
    this.applyAppearance();
    this.send(eventChannels.preferences, preferences);
  }

  /** Floats the page's video above other windows, or brings it back. */
  async togglePictureInPicture(pageId: PageId): Promise<void> {
    const contents = contentsForPage(pageId);
    const result = contents
      ? await togglePictureInPicture(contents)
      : ('none' as const);
    if (result !== 'ok') {
      this.notify({ kind: 'no-video', blocked: result === 'blocked' });
    }
  }

  /** Shows the page's article on its own, or takes Reader away again. */
  async toggleReader(pageId: PageId): Promise<void> {
    const contents = contentsForPage(pageId);
    if (!contents) return;
    let siteName = '';
    try {
      siteName = new URL(contents.getURL()).host.replace(/^www\./, '');
    } catch {
      // A page without an address shows no site line.
    }
    // Reader follows light and dark by itself, like the page under it.
    const result = await toggleReaderIn(contents, { siteName });
    if (result === 'none') this.notify({ kind: 'no-article' });
  }

  /** A failure to write a file is said out loud, not just logged. */
  private async saved(
    run: () => Promise<string | null>,
  ): Promise<string | null> {
    try {
      const filename = await run();
      if (filename) this.notify({ kind: 'exported', filename });
      return filename;
    } catch (error) {
      dialog.showErrorBox('The file couldn’t be saved', String(error));
      return null;
    }
  }

  saveBookmarks(): Promise<string | null> {
    return this.saved(() =>
      exportBookmarks(this.window, this.options.preferences),
    );
  }

  saveTrail(): Promise<string | null> {
    return this.saved(() => exportTrail(this.window, this.controller));
  }

  /** Asks for a Markdown file and brings it in as a new trail. */
  async importTrailFile(): Promise<void> {
    const chosen = await chooseTrailFile(this.window);
    if (!chosen) return;
    if (chosen.text === null) {
      return this.notify({
        kind: 'trail-not-imported',
        reason: chosen.tooLarge ? 'too-long' : 'unreadable',
        source: chosen.name,
      });
    }
    this.bringInOutline(chosen.text, null, chosen.name);
  }

  /** Brings in the outline on the clipboard, under a page or on its own. */
  async pasteOutline(parentId: PageId | null): Promise<void> {
    this.bringInOutline(await clipboard.readText(), parentId, null);
  }

  private bringInOutline(
    text: string,
    parentId: PageId | null,
    source: string | null,
  ): void {
    const outline = parseTrailOutline(text);
    if (outline.pageCount === 0 || outline.pageCount > MAX_OUTLINE_PAGES) {
      return this.notify({
        kind: 'trail-not-imported',
        reason: outline.pageCount === 0 ? 'empty' : 'too-long',
        source,
      });
    }
    const added = this.controller.importOutline(outline, {
      parentId,
      ...(source ? { name: source.replace(/\.[^.]+$/, '') } : {}),
    });
    this.notify({
      kind: 'trail-imported',
      ...added,
      skippedAddresses: outline.skippedAddresses,
    });
  }

  /**
   * Hands a trail or group to macOS as a Markdown file, for dropping in the
   * Finder or another app. The file is only there for the drop to read.
   */
  async dragTrailOut(
    target: { pageId: PageId } | { groupId: string },
  ): Promise<void> {
    const trail = trailFile(this.controller, target);
    if (!trail) return;
    const folder = await mkdtemp(path.join(tmpdir(), 'splash-trail-'));
    const file = path.join(folder, trail.filename);
    await writeFile(file, trail.text, { encoding: 'utf8', mode: 0o600 });
    const icon = await app.getFileIcon(file, { size: 'normal' });
    setTimeout(() => {
      void rm(folder, { recursive: true, force: true });
    }, TRAIL_DRAG_FILE_MS);
    if (!this.window.webContents.isDestroyed()) {
      this.window.webContents.startDrag({ file, icon });
    }
  }

  /** Confirms something in the shell, without taking focus from the page. */
  /** Copies a page's title and address, and says what was copied. */
  async copyPageAs(pageId: PageId, format: CopyFormat): Promise<void> {
    const page = this.controller.snapshot().pages[pageId];
    if (!page?.url) return;
    const title = page.customTitle || page.title;
    await clipboard.writeText(formatPageLink(format, title, page.url));
    this.notify({ kind: 'copied', what: format, subject: title || null });
  }

  /** Goes to what's on the clipboard, in the active page or a new one. */
  async pasteAndGo(): Promise<void> {
    const input = clipboardAddressInput(await clipboard.readText());
    if (!input) return this.notify({ kind: 'nothing-to-paste' });
    const { activePageId } = this.controller;
    if (activePageId) this.controller.navigate(activePageId, input);
    else this.controller.createPage({ input });
    this.sendUiCommand({ type: 'close-overlay' });
    this.controller.focusActivePage();
  }

  /** Goes to the homepage; with none set, Settings is where to choose one. */
  goHome(): void {
    const { homepage } = this.options.preferences.get();
    if (!homepage) return void this.options.openSettings();
    const { activePageId } = this.controller;
    if (activePageId) this.controller.navigate(activePageId, homepage);
    else this.controller.createPage({ url: homepage });
    this.sendUiCommand({ type: 'close-overlay' });
    this.controller.focusActivePage();
  }

  notify(notice: Notice): void {
    this.send(eventChannels.notice, notice);
  }

  sendUiCommand(command: UiCommand): void {
    this.window.webContents.focus();
    this.send(eventChannels.uiCommand, command);
  }

  /** A trail command, leaving focus where it is. */
  sendToTrail(command: UiCommand): void {
    this.send(eventChannels.uiCommand, command);
  }

  /**
   * A workspace can be light, dark or follow macOS; left at Default, the
   * Theme in Settings applies. The window frame takes the workspace's frame
   * colour. While the workspace editor is open, the mode it's showing wins.
   */
  applyAppearance(): void {
    const mode = this.previewMode ?? this.controller.activeAppearance.mode;
    const source =
      mode === 'default' ? this.options.preferences.get().theme : mode;
    if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
    if (!this.window.isDestroyed()) {
      this.window.setBackgroundColor(
        chromeBackground(this.controller.activeAppearance),
      );
    }
  }

  /** Tells extensions when a different page comes to the front. */
  private selectForExtensions(pageId: string | null): void {
    const contents =
      pageId && this.controller.holds(pageId)
        ? contentsForPage(pageId)
        : undefined;
    // A page that slept and woke up has new contents, so compare those.
    if (!contents || contents.id === this.extensionContentsId) return;
    // An asleep page has no contents to show; never hand over a closing one.
    if (contents.isDestroyed()) return;
    this.extensionContentsId = contents.id;
    this.options.extensions?.selectPage(contents);
  }

  /** Each profile's pages are made the same way, in its own session. */
  private readonly hostFactories = new Map<string, PageHostFactory>();

  private hostFactoryFor(profile: WindowProfile): PageHostFactory {
    const known = this.hostFactories.get(profile.key);
    if (known) return known;
    const factory = createElectronPageHostFactory({
      window: this.window,
      session: profile.session,
      preload: path.join(__dirname, 'page-preload.cjs'),
      allowFile: (address) =>
        allowLocalFile(address, { remember: !this.options.isPrivate }),
      openDroppedFiles: (paths) => this.options.openFiles(paths),
      isSoundBlocked: (origin) =>
        this.safely(() => profile.store.getPermission(origin, 'sound')) ===
        false,
      webPreferences: () => pageWebPreferences(this.options.preferences.get()),
      zoomFor: (address) => zoomFor(this.options.preferences.get(), address),
      rememberZoom: (address, percent) => {
        if (this.options.isPrivate) return;
        const siteZoom = rememberZoom(
          this.options.preferences.get(),
          address,
          percent,
        );
        if (siteZoom) this.options.preferences.update({ siteZoom });
      },
      popupsAllowed: (origin) =>
        this.safely(() => profile.store.getPermission(origin, 'popups')) ??
        null,
      httpsOnly: () => this.options.preferences.get().httpsOnly,
      trackpadSwipes: () => this.options.preferences.get().trackpadSwipes,
      plainHttpAllowed: (address) =>
        this.safely(() => {
          const { origin } = new URL(address);
          return (
            profile.store.getPermission(origin, 'insecure') === true ||
            profile.store.getPermission(wwwSibling(origin), 'insecure') === true
          );
        }) === true,
      certificateException: (address) =>
        this.safely(() => hasCertificateException(profile.store, address)) ===
        true,
      certificateLocked: (address) => this.options.certificates.locked(address),
      onContentsCreated: (contents) =>
        this.options.extensions?.addPage(contents, this.window),
      onContentsMoved: (contents, window) =>
        this.options.extensions?.movePage(contents, window as BrowserWindow),
      extensionMenuItems: (contents, params) =>
        this.options.extensions?.menuItems(contents, params) ?? [],
      openExternal: (contents, url) =>
        void requestExternalOpen(
          pageHandleFor(contents),
          contents.getURL(),
          url,
          profile.store,
          {
            appFor: (link) => app.getApplicationNameForProtocol(link),
            open: (link) => void shell.openExternal(link),
          },
        ).catch((error: unknown) =>
          console.error('Splash could not open an external link', error),
        ),
    });
    this.hostFactories.set(profile.key, factory);
    return factory;
  }

  /** Connection and permission details for the page's site. */
  private siteInfo(pageId: string, ads: AdsOnPage): SiteInfo | null {
    const page = this.controller.snapshot().pages[pageId];
    const origin = webOrigin(page?.url ?? undefined);
    if (!origin) return null;
    const { store } = this.activeProfile;
    return {
      origin,
      host: new URL(origin).host,
      security:
        origin.startsWith('https:') &&
        !this.safely(() => hasCertificateException(store, origin))
          ? 'secure'
          : 'insecure',
      blockedCount: ads.blocked,
      refusedBySystem: this.controller.systemRefusedOn(pageId),
      // A secure site has no plain HTTP address to allow.
      permissions: SITE_PERMISSIONS.filter(
        // The warning itself asks about danger; Settings lists what was chosen.
        (permission) =>
          permission !== 'dangerous' &&
          (permission !== 'insecure' || origin.startsWith('http:')),
      ).map((permission) => {
        const decided =
          permission === 'ads'
            ? ads.allowed
            : (this.safely(() => store.getPermission(origin, permission)) ??
              null);
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
    if (
      permission === 'sound' ||
      permission === 'save-passwords' ||
      permission === 'picture-in-picture'
    ) {
      return 'allow';
    }
    if (permission === 'ads') {
      return this.options.preferences.get().blockAds ? 'block' : 'allow';
    }
    if (permission === 'insecure') {
      return this.options.preferences.get().httpsOnly ? 'block' : 'allow';
    }
    if (permission === 'third-party-cookies') {
      return this.options.preferences.get().blockThirdPartyCookies
        ? 'block'
        : 'allow';
    }
    if (
      permission === 'javascript' ||
      permission === 'images' ||
      permission === 'autoplay'
    ) {
      return 'allow';
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
    const { store } = this.activeProfile;
    const matches = this.safely(() => store.searchHistory(query, 60)) ?? [];
    const frequent = this.safely(() => store.frequentHistory(300)) ?? [];
    const byUrl = new Map(matches.map((entry) => [entry.url, entry]));
    for (const entry of frequent) {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
    }
    return [...byUrl.values()];
  }

  /**
   * Groups used to be saved as plain links in the preferences. They become
   * real pages of the active workspace, filed in groups of the same name,
   * and the saved copies go once the session holds them.
   */
  private adoptSavedGroups(store: TrailStore): void {
    const { preferences } = this.options;
    const saved = preferences.get().collections;
    const groups = saved.filter((item) => item.kind === 'group');
    if (groups.length === 0) return;
    for (const group of groups) {
      this.controller.importGroup(group.name, group.collapsed, group.links);
    }
    const kept = this.safely(() => {
      store.saveSession(this.controller.exportSession());
      return true;
    });
    if (kept) {
      preferences.update({
        collections: saved.filter((item) => item.kind !== 'group'),
      });
    }
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
