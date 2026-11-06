import type {
  BrowserSnapshot,
  ClosedSummary,
  GroupIcon,
  AboutInfo,
  ClearDataRequest,
  ContentBlockingStatus,
  ContentInsets,
  DefaultBrowserStatus,
  SiteSettings,
  ThreatListStatus,
  CookieSite,
  CookieDeletion,
  StorageStatus,
  DownloadAction,
  DownloadSummary,
  HistoryEntry,
  ImportResult,
  ImportSource,
  SettingsSection,
  MoveOrigin,
  Notice,
  PageId,
  PaletteItem,
  PermissionDecision,
  SiteInfo,
  SitePermission,
  TaskList,
  ExtensionInfo,
  TrailPosition,
  UiCommand,
  WorkspaceAppearance,
  WorkspaceId,
  WorkspaceMode,
} from './types';
import type {
  AddressFields,
  AutofillItem,
  AutofillMessage,
  CardFields,
  CredentialAnswer,
  CredentialPrompt,
  VaultListing,
} from './vault';
import type { AiPanelAction, AiPanelPlacement, AiPanelState } from './ai';
import type { CopyFormat } from './page-link';
import type { PaletteScope } from './palette';
import type { Preferences } from './preferences';

export interface InvokeOutputs {
  'vault:list': VaultListing;
  'vault:save-login': void;
  'vault:save-address': void;
  'vault:save-card': void;
  'vault:delete': string | null;
  'vault:undo': boolean;
  'vault:reveal': string | null;
  'vault:copy': boolean;
  'vault:export': string | null;
  'transfer:sources': ImportSource[];
  'transfer:import': ImportResult;
  'transfer:import-file': ImportResult | null;
  'transfer:undo': boolean;
  'transfer:trash': boolean;
  'transfer:export-bookmarks': string | null;
  'transfer:export-trail': string | null;
  'autofill:current': AutofillItem[];
  'autofill:choose': void;
  'credential:respond': void;
  'window:info': { isPrivate: boolean };
  'window:new-private': void;
  'file:choose': void;
  'file:open-dropped': void;
  'app:open-settings-section': void;
  'page:picture-in-picture': void;
  'extensions:manage': void;
  'extensions:list': ExtensionInfo[];
  'extensions:set-enabled': void;
  'extensions:remove': void;
  'extensions:open-store': void;
  'extensions:open-page': void;
  /** Why the chosen folder couldn't be loaded; `null` if it was, or none was. */
  'extensions:load-unpacked': string | null;
  /** A section Settings was asked to show as it opened, once. */
  'settings:take-section': string | null;
  'page:share': void;
  'page:copy-as': void;
  'page:paste-and-go': void;
  'page:go-home': void;
  'address:show-menu': void;
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
  'page:continue-over-http': void;
  'page:continue-to-dangerous-site': void;
  'page:continue-past-certificate': void;
  'page:stop': void;
  'page:set-collapsed': void;
  'page:create-child': PageId;
  'page:close-branch': void;
  'page:close-others': void;
  'page:close-below': void;
  'page:view-source': PageId | null;
  'page:toggle-devtools': void;
  'page:print': void;
  'page:save-as': void;
  'workspace:delete': void;
  'page:reopen-closed': PageId | null;
  'page:reopen-closed-item': PageId | null;
  'page:recently-closed': ClosedSummary[];
  'page:undo-close': boolean;
  'page:close-again': number | null;
  'page:move': void;
  'page:return': void;
  'page:rename': void;
  'page:set-pinned': void;
  'group:create': string;
  'group:rename': void;
  'group:set-collapsed': void;
  'group:set-icon': void;
  'group:delete': void;
  'group:delete-with-pages': void;
  'page:set-group': void;
  'app:open-settings': void;
  'page:duplicate': PageId;
  'page:move-to-workspace': void;
  'page:move-to-window': void;
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
  'page:open-blocked-popup': void;
  'site:get-info': SiteInfo | null;
  'site:set-permission': void;
  'site:reset': void;
  'view:freeze': Record<PageId, string>;
  'palette:query': PaletteItem[];
  'search:suggest': PaletteItem[];
  'search:site-icon': string | null;
  'tasks:list': TaskList;
  'tasks:end': void;
  'downloads:list': DownloadSummary[];
  'downloads:act': void;
  'downloads:clear': void;
  'downloads:open-folder': void;
  'history:list': HistoryEntry[];
  'history:delete': void;
  'history:restore': void;
  'settings:sites': SiteSettings[];
  'cookies:list': CookieSite[];
  'cookies:delete': CookieDeletion;
  'cookies:undo': boolean;
  'settings:content-blocking': ContentBlockingStatus;
  'settings:threat-list': ThreatListStatus;
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
  extensions: 'extensions:changed',
  autofill: 'autofill:message',
  credentialPrompt: 'credential:prompt',
  settingsSection: 'settings:show-section',
} as const;

/** The API the preload script exposes on `window.splash`. */
export interface SplashApi {
  listVault(): Promise<VaultListing>;
  saveLogin(fields: {
    id?: string;
    origin: string;
    username: string;
    password: string;
  }): Promise<void>;
  saveAddress(fields: AddressFields, id?: string): Promise<void>;
  saveCard(fields: CardFields, id?: string): Promise<void>;
  /** Removes it; the result undoes that for as long as Splash runs. */
  deleteVaultItem(id: string): Promise<string | null>;
  undoVaultDelete(token: string): Promise<boolean>;
  /** Asks for Touch ID first; `null` if that was refused. */
  revealPassword(id: string): Promise<string | null>;
  copyPassword(id: string): Promise<boolean>;
  /** The file's name, or `null` if the user changed their mind. */
  exportPasswords(): Promise<string | null>;
  importSources(): Promise<ImportSource[]>;
  importFrom(
    id: string,
    what: { bookmarks: boolean; history: boolean },
  ): Promise<ImportResult>;
  /** Asks which file; `null` if none was chosen. */
  importFile(): Promise<ImportResult | null>;
  undoImport(token: string): Promise<boolean>;
  /** Moves the password file just imported to the Trash. */
  trashImportedFile(token: string): Promise<boolean>;
  exportBookmarks(): Promise<string | null>;
  exportTrail(): Promise<string | null>;
  currentAutofill(): Promise<AutofillItem[]>;
  chooseAutofill(id: string): Promise<void>;
  resizeAutofill(height: number): void;
  onAutofill(listener: (message: AutofillMessage) => void): () => void;
  answerCredentialPrompt(id: string, answer: CredentialAnswer): Promise<void>;
  onCredentialPrompt(
    listener: (prompt: CredentialPrompt | null) => void,
  ): () => void;
  windowInfo(): Promise<{ isPrivate: boolean }>;
  newPrivateWindow(): Promise<void>;
  chooseFiles(): Promise<void>;
  openSettingsSection(section: SettingsSection): Promise<void>;
  togglePictureInPicture(pageId: PageId): Promise<void>;
  getAuthChallenge(): Promise<InvokeOutputs['auth:challenge']>;
  respondAuth(
    credentials: { username: string; password: string } | null,
  ): Promise<void>;
  manageExtensions(): Promise<void>;
  listExtensions(): Promise<ExtensionInfo[]>;
  onExtensions(listener: (extensions: ExtensionInfo[]) => void): () => void;
  setExtensionEnabled(id: string, enabled: boolean): Promise<void>;
  removeExtension(id: string): Promise<void>;
  openWebStore(): Promise<void>;
  openExtensionPage(url: string): Promise<void>;
  loadUnpackedExtension(): Promise<string | null>;
  takeSettingsSection(): Promise<string | null>;
  onSettingsSection(listener: (section: string) => void): () => void;
  sharePage(pageId: PageId): Promise<void>;
  /** Copies the page's title and address in this format, and confirms it. */
  copyPageAs(pageId: PageId, format: CopyFormat): Promise<void>;
  /** Goes to whatever the clipboard holds, in the active page. */
  pasteAndGo(): Promise<void>;
  /** Goes to the homepage, or opens Settings if there isn't one yet. */
  goHome(): Promise<void>;
  /** The native right-click menu of the address field. */
  showAddressMenu(): Promise<void>;
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
  /** The user read the warning: loads the site over HTTP and remembers it. */
  continueOverHttp(pageId: PageId): Promise<void>;
  continueToDangerousSite(pageId: PageId): Promise<void>;
  continuePastCertificate(pageId: PageId): Promise<void>;
  stop(pageId: PageId): Promise<void>;
  setCollapsed(pageId: PageId, collapsed: boolean): Promise<void>;
  createChildPage(pageId: PageId, input?: string): Promise<PageId>;
  closeBranch(pageId: PageId): Promise<void>;
  /** Closes the rest of the workspace's trail; see the controller. */
  closeOtherPages(pageId: PageId): Promise<void>;
  /** Closes what's below it in the sidebar; see the controller. */
  closePagesBelow(pageId: PageId): Promise<void>;
  /** Opens a web page's source as its child; null if it has none. */
  viewSource(pageId: PageId): Promise<PageId | null>;
  toggleDevTools(pageId: PageId): Promise<void>;
  print(pageId: PageId): Promise<void>;
  savePageAs(pageId: PageId): Promise<void>;
  /** Undoable with reopen closed; the last workspace stays. */
  deleteWorkspaceFromShell(workspaceId: WorkspaceId): Promise<void>;
  reopenClosed(): Promise<PageId | null>;
  /** One entry of `recentlyClosed`, wherever it is in the list. */
  reopenClosedItem(serial: number): Promise<PageId | null>;
  /** What can be reopened, most recently closed first. */
  recentlyClosed(): Promise<ClosedSummary[]>;
  /** Undoes that close; false if it was already undone another way. */
  undoClose(serial: number): Promise<boolean>;
  /** Redoes an undone close; the new close's serial, or null if nothing closed. */
  closeAgain(serial: number): Promise<number | null>;
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
  /** Starts a group in this workspace, filing `pageId` in it if given. */
  createGroup(name?: string, pageId?: PageId): Promise<string>;
  renameGroup(groupId: string, name: string): Promise<void>;
  setGroupCollapsed(groupId: string, collapsed: boolean): Promise<void>;
  /** Gives a group its own mark, or back to a folder with `null`. */
  setGroupIcon(groupId: string, icon: GroupIcon | null): Promise<void>;
  /** Dissolves a group; its pages stay, no longer filed together. */
  deleteGroup(groupId: string): Promise<void>;
  /** Removes a group and closes its pages; reopen closed brings them back. */
  deleteGroupWithPages(groupId: string): Promise<void>;
  /** Files a page in a group, or takes it out with `null`. */
  setPageGroup(pageId: PageId, groupId: string | null): Promise<void>;
  openSettings(): Promise<void>;
  renamePage(pageId: PageId, title: string | null): Promise<void>;
  duplicatePage(pageId: PageId): Promise<PageId>;
  /** Moves a page with its branch to the end of another workspace. */
  movePageToWorkspace(pageId: PageId, workspaceId: WorkspaceId): Promise<void>;
  /** Shows a page in another window, or in a new one when `windowId` is `null`. */
  movePageToWindow(pageId: PageId, windowId: string | null): Promise<void>;
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
  /** Opens a popup the page was stopped from opening, beneath that page. */
  openBlockedPopup(pageId: PageId, url: string): Promise<void>;
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
  /** A toast with Undo or Redo is showing, so ⌘Z and ⇧⌘Z mean the trail. */
  setTrailUndoOffered(offered: boolean): void;
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
  /** A shortcut's site icon as an inline image; `null` if it has none. */
  siteIcon(url: string): Promise<string | null>;
  moveWorkspace(workspaceId: WorkspaceId, index: number): Promise<void>;
  setContentInsets(insets: ContentInsets): void;
  focusPage(): void;
  onSnapshot(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onUiCommand(listener: (command: UiCommand) => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
  /** What's running, with its memory and processor use. */
  listTasks(): Promise<TaskList>;
  /** Ends a page's process; the page offers to reload. */
  endTask(pageId: PageId): Promise<void>;
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
  getThreatListStatus(): Promise<ThreatListStatus>;
  /** Every site's cookies, or only those of the site `host` belongs to. */
  listCookies(host?: string): Promise<CookieSite[]>;
  /** Deletes a site's cookies, or just one of them; can be undone for a minute. */
  deleteCookies(
    site: string,
    only?: { name: string; domain: string; path: string },
  ): Promise<CookieDeletion>;
  undoDeleteCookies(token: string): Promise<boolean>;
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
