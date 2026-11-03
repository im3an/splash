import type {
  BrowserSnapshot,
  AboutInfo,
  ClearDataRequest,
  ContentBlockingStatus,
  ContentInsets,
  DefaultBrowserStatus,
  SiteSettings,
  StorageStatus,
  DownloadAction,
  DownloadSummary,
  HistoryEntry,
  MoveOrigin,
  Notice,
  PageId,
  PaletteItem,
  PermissionDecision,
  SiteInfo,
  SitePermission,
  TrailPosition,
  UiCommand,
  WorkspaceAppearance,
  WorkspaceId,
  WorkspaceMode,
} from './types';
import type { AiPanelAction, AiPanelPlacement, AiPanelState } from './ai';
import type { PaletteScope } from './palette';
import type { Preferences } from './preferences';

export interface InvokeOutputs {
  'extensions:manage': void;
  'page:share': void;
  'auth:challenge': {
    origin: string;
    host: string;
    isProxy: boolean;
    secure: boolean;
  };
  'auth:respond': void;
  'browser:get-snapshot': BrowserSnapshot;
  'storage:status': StorageStatus;
  'page:create': PageId;
  'page:activate': void;
  'page:close': void;
  'page:navigate': void;
  'page:go-back': void;
  'page:go-forward': void;
  'page:reload': void;
  'page:stop': void;
  'page:set-collapsed': void;
  'page:create-child': PageId;
  'page:close-branch': void;
  'page:close-others': void;
  'page:print': void;
  'page:save-as': void;
  'workspace:delete': void;
  'page:reopen-closed': PageId | null;
  'page:move': void;
  'page:return': void;
  'page:rename': void;
  'page:set-pinned': void;
  'app:open-settings': void;
  'page:duplicate': PageId;
  'page:move-to-workspace': void;
  'page:open-split': void;
  'page:toggle-split': void;
  'split:close': void;
  'page:set-note': void;
  'workspace:switch': void;
  'workspace:rename': void;
  'workspace:show-menu': void;
  'workspace:create': WorkspaceId;
  'workspace:customize': void;
  'page:set-muted': void;
  'page:zoom': void;
  'page:find': void;
  'page:stop-find': void;
  'page:respond-permission': void;
  'site:get-info': SiteInfo | null;
  'site:set-permission': void;
  'site:reset': void;
  'view:freeze': Record<PageId, string>;
  'palette:query': PaletteItem[];
  'search:suggest': PaletteItem[];
  'downloads:list': DownloadSummary[];
  'downloads:act': void;
  'downloads:clear': void;
  'downloads:open-folder': void;
  'history:list': HistoryEntry[];
  'history:delete': void;
  'history:restore': void;
  'settings:sites': SiteSettings[];
  'settings:content-blocking': ContentBlockingStatus;
  'settings:update-filter-lists': ContentBlockingStatus;
  'settings:clear-data': { summary: string; undoToken: string | null };
  'settings:undo-clear': boolean;
  'settings:default-browser': DefaultBrowserStatus;
  'settings:make-default-browser': DefaultBrowserStatus;
  'settings:open-data-folder': void;
  'settings:about': AboutInfo;
  'settings:edit-workspace': void;
  'settings:delete-workspace': void;
  'preferences:get': Preferences;
  'preferences:update': Preferences;
  'workspace:move': void;
  'ai:act': void;
}

export const eventChannels = {
  snapshot: 'browser:snapshot',
  uiCommand: 'ui:command',
  preferences: 'preferences:changed',
  downloads: 'downloads:changed',
  storage: 'storage:changed',
  notice: 'shell:notice',
  aiPanel: 'ai:state',
} as const;

/** The API the preload script exposes on `window.splash`. */
export interface SplashApi {
  getAuthChallenge(): Promise<InvokeOutputs['auth:challenge']>;
  respondAuth(
    credentials: { username: string; password: string } | null,
  ): Promise<void>;
  manageExtensions(): Promise<void>;
  sharePage(pageId: PageId): Promise<void>;
  platform: NodeJS.Platform;
  getSnapshot(): Promise<BrowserSnapshot>;
  createPage(input?: string): Promise<PageId>;
  activatePage(pageId: PageId): Promise<void>;
  /** A pinned page only goes to sleep unless `unpin` is set. */
  closePage(pageId: PageId, options?: { unpin?: boolean }): Promise<void>;
  navigate(pageId: PageId, input: string): Promise<void>;
  goBack(pageId: PageId): Promise<void>;
  goForward(pageId: PageId): Promise<void>;
  reload(pageId: PageId): Promise<void>;
  stop(pageId: PageId): Promise<void>;
  setCollapsed(pageId: PageId, collapsed: boolean): Promise<void>;
  createChildPage(pageId: PageId, input?: string): Promise<PageId>;
  closeBranch(pageId: PageId): Promise<void>;
  /** Closes the rest of the workspace's trail; see the controller. */
  closeOtherPages(pageId: PageId): Promise<void>;
  print(pageId: PageId): Promise<void>;
  savePageAs(pageId: PageId): Promise<void>;
  /** Undoable with reopen closed; the last workspace stays. */
  deleteWorkspaceFromShell(workspaceId: WorkspaceId): Promise<void>;
  reopenClosed(): Promise<PageId | null>;
  /** Moves a page under `parentId`, right after `afterId` (first if null). */
  movePage(
    pageId: PageId,
    parentId: PageId | null,
    afterId: PageId | null,
  ): Promise<void>;
  /** Puts a page moved to another workspace back where it was. */
  returnPage(pageId: PageId, origin: MoveOrigin): Promise<void>;
  /** Pins or unpins a page; `origin` (undo) puts it back where it was. */
  setPinned(
    pageId: PageId,
    pinned: boolean,
    origin?: TrailPosition,
  ): Promise<void>;
  openSettings(): Promise<void>;
  renamePage(pageId: PageId, title: string | null): Promise<void>;
  duplicatePage(pageId: PageId): Promise<PageId>;
  /** Moves a page with its branch to the end of another workspace. */
  movePageToWorkspace(pageId: PageId, workspaceId: WorkspaceId): Promise<void>;
  setNote(pageId: PageId, note: string | null): Promise<void>;
  /**
   * Shows `pageId` beside `otherId` and makes it active: on `side` when
   * given (a page dropped there), else in trail order.
   */
  openSplit(
    pageId: PageId,
    otherId: PageId,
    side?: 'left' | 'right',
  ): Promise<void>;
  /** Closes the page's split view, or opens one with its parent or child. */
  toggleSplit(pageId: PageId): Promise<void>;
  closeSplit(): Promise<void>;
  switchWorkspace(workspaceId: WorkspaceId): Promise<void>;
  renameWorkspace(workspaceId: WorkspaceId, name: string): Promise<void>;
  showWorkspaceMenu(): Promise<void>;
  createWorkspace(
    name: string,
    appearance: WorkspaceAppearance,
  ): Promise<WorkspaceId>;
  customizeWorkspace(
    workspaceId: WorkspaceId,
    name: string,
    appearance: WorkspaceAppearance,
  ): Promise<void>;
  setMuted(pageId: PageId, muted: boolean): Promise<void>;
  zoom(pageId: PageId, direction: 'in' | 'out' | 'reset'): Promise<void>;
  find(
    pageId: PageId,
    text: string,
    options: { forward: boolean; findNext: boolean },
  ): Promise<void>;
  stopFind(pageId: PageId): Promise<void>;
  respondToPermission(
    pageId: PageId,
    requestId: string,
    granted: boolean,
  ): Promise<void>;
  getSiteInfo(pageId: PageId): Promise<SiteInfo | null>;
  setSitePermission(
    origin: string,
    permission: SitePermission,
    decision: PermissionDecision,
  ): Promise<void>;
  resetSite(origin: string): Promise<void>;
  /** Stills of the pages on screen by page, to show under a popover. */
  freezePage(): Promise<Record<PageId, string>>;
  /** While true, the live page steps aside so shell popovers are visible. */
  setOverlayActive(active: boolean): void;
  /**
   * Shows the app in a workspace's light or dark while it's being edited;
   * `null` goes back to the active workspace's.
   */
  previewWorkspaceMode(mode: WorkspaceMode | null): void;
  /**
   * `complete` lets the leading row fill in the rest of an address from
   * history; the field asks only while the user is typing forward.
   */
  queryPalette(
    query: string,
    scope: PaletteScope,
    complete?: boolean,
  ): Promise<PaletteItem[]>;
  /** What the search engine suggests for `query`; none when turned off. */
  suggestSearch(query: string): Promise<PaletteItem[]>;
  moveWorkspace(workspaceId: WorkspaceId, index: number): Promise<void>;
  setContentInsets(insets: ContentInsets): void;
  focusPage(): void;
  onSnapshot(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onUiCommand(listener: (command: UiCommand) => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
  listDownloads(): Promise<DownloadSummary[]>;
  actOnDownload(id: string, action: DownloadAction): Promise<void>;
  clearDownloads(): Promise<void>;
  openDownloadsFolder(): Promise<void>;
  onDownloads(listener: (downloads: DownloadSummary[]) => void): () => void;
  /** Recent history, newest first; only matching entries when `query` is set. */
  listHistory(query: string, limit: number): Promise<HistoryEntry[]>;
  deleteHistoryEntry(url: string): Promise<void>;
  /** Puts back an entry removed with `deleteHistoryEntry` (undo). */
  restoreHistoryEntry(entry: HistoryEntry): Promise<void>;
  listSiteSettings(): Promise<SiteSettings[]>;
  contentBlockingStatus(): Promise<ContentBlockingStatus>;
  updateFilterLists(): Promise<ContentBlockingStatus>;
  clearBrowsingData(
    request: ClearDataRequest,
  ): Promise<{ summary: string; undoToken: string | null }>;
  undoClearBrowsingData(token: string): Promise<boolean>;
  defaultBrowserStatus(): Promise<DefaultBrowserStatus>;
  makeDefaultBrowser(): Promise<DefaultBrowserStatus>;
  openDataFolder(): Promise<void>;
  about(): Promise<AboutInfo>;
  /** Opens the workspace editor in the browser window (null: new workspace). */
  editWorkspace(workspaceId: WorkspaceId | null): Promise<void>;
  deleteWorkspace(workspaceId: WorkspaceId): Promise<void>;
  storageStatus(): Promise<StorageStatus>;
  onStorageStatus(listener: (status: StorageStatus) => void): () => void;
  getPreferences(): Promise<Preferences>;
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>;
  onPreferences(listener: (preferences: Preferences) => void): () => void;
  /** Shows an assistant where the shell draws the AI panel; null closes it. */
  placeAiPanel(placement: AiPanelPlacement | null): void;
  actOnAiPanel(action: AiPanelAction): Promise<void>;
  onAiPanel(listener: (state: AiPanelState) => void): () => void;
}
