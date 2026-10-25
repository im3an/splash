import type {
  BrowserSnapshot,
  AboutInfo,
  ClearDataRequest,
  ContentInsets,
  DefaultBrowserStatus,
  SiteSettings,
  StorageStatus,
  DownloadAction,
  DownloadSummary,
  PageId,
  PaletteItem,
  PermissionDecision,
  SiteInfo,
  SitePermission,
  UiCommand,
  WorkspaceAppearance,
  WorkspaceId,
} from './types';
import type { Preferences } from './preferences';

export interface InvokeOutputs {
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
  'page:reopen-closed': PageId | null;
  'page:move': void;
  'page:rename': void;
  'page:duplicate': PageId;
  'page:show-menu': void;
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
  'downloads:list': DownloadSummary[];
  'downloads:act': void;
  'downloads:clear': void;
  'downloads:open-folder': void;
  'settings:sites': SiteSettings[];
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
}

export const eventChannels = {
  snapshot: 'browser:snapshot',
  uiCommand: 'ui:command',
  preferences: 'preferences:changed',
  downloads: 'downloads:changed',
  storage: 'storage:changed',
} as const;

/** The API the preload script exposes on `window.splash`. */
export interface SplashApi {
  platform: NodeJS.Platform;
  getSnapshot(): Promise<BrowserSnapshot>;
  createPage(input?: string): Promise<PageId>;
  activatePage(pageId: PageId): Promise<void>;
  closePage(pageId: PageId): Promise<void>;
  navigate(pageId: PageId, input: string): Promise<void>;
  goBack(pageId: PageId): Promise<void>;
  goForward(pageId: PageId): Promise<void>;
  reload(pageId: PageId): Promise<void>;
  stop(pageId: PageId): Promise<void>;
  setCollapsed(pageId: PageId, collapsed: boolean): Promise<void>;
  createChildPage(pageId: PageId): Promise<PageId>;
  closeBranch(pageId: PageId): Promise<void>;
  reopenClosed(): Promise<PageId | null>;
  /** Moves a page under `parentId`, right after `afterId` (first if null). */
  movePage(
    pageId: PageId,
    parentId: PageId | null,
    afterId: PageId | null,
  ): Promise<void>;
  renamePage(pageId: PageId, title: string | null): Promise<void>;
  duplicatePage(pageId: PageId): Promise<PageId>;
  /** Opens the native context menu for a page in the sidebar. */
  showPageMenu(pageId: PageId): Promise<void>;
  setNote(pageId: PageId, note: string | null): Promise<void>;
  /** Shows `pageId` beside `otherId` and makes it active. */
  openSplit(pageId: PageId, otherId: PageId): Promise<void>;
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
  queryPalette(
    query: string,
    scope: 'palette' | 'address',
  ): Promise<PaletteItem[]>;
  moveWorkspace(workspaceId: WorkspaceId, index: number): Promise<void>;
  setContentInsets(insets: ContentInsets): void;
  focusPage(): void;
  onSnapshot(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onUiCommand(listener: (command: UiCommand) => void): () => void;
  listDownloads(): Promise<DownloadSummary[]>;
  actOnDownload(id: string, action: DownloadAction): Promise<void>;
  clearDownloads(): Promise<void>;
  openDownloadsFolder(): Promise<void>;
  onDownloads(listener: (downloads: DownloadSummary[]) => void): () => void;
  listSiteSettings(): Promise<SiteSettings[]>;
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
}
