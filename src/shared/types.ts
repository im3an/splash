export type PageId = string;
export type WorkspaceId = string;

export type PageErrorKind =
  | 'load-failed'
  | 'crashed'
  /** HTTPS failed where HTTP might work; `url` is the plain HTTP address. */
  | 'no-secure-connection'
  /** On the phishing and malware lists; nothing was requested from `url`. */
  | 'dangerous-site'
  /** `url` answers with a file; `description` is its name. */
  | 'file-download';

export interface PageError {
  kind: PageErrorKind;
  /** Chromium net error code for load failures, 0 otherwise. */
  code: number;
  description: string;
  url: string;
  /** The site insists on valid HTTPS, so there's no way past this warning. */
  certificateLocked?: boolean;
}

/** A row of the task manager: one process and what runs in it. */
export interface TaskEntry {
  id: string;
  kind: 'page' | 'extension' | 'splash';
  title: string;
  url: string | null;
  faviconUrl: string | null;
  /** The pages ended together if this row is ended; empty if it can't be. */
  pageIds: PageId[];
  memoryBytes: number;
  cpuPercent: number;
  isUnresponsive: boolean;
}

export interface TaskList {
  entries: TaskEntry[];
  /** Pages with no process right now. */
  asleepPages: number;
}

export interface FindResult {
  /** 1-based; 0 when nothing matched. */
  activeMatch: number;
  matches: number;
}

/** A page node as the renderer sees it. The trail tree in the main process is the source of truth. */
export interface PageSnapshot {
  id: PageId;
  parentId: PageId | null;
  childIds: PageId[];
  /** `null` until the page has been pointed at an address. */
  url: string | null;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  collapsed: boolean;
  error: PageError | null;
  /** The page's view was freed to save memory; it reloads when activated. */
  isDiscarded: boolean;
  /** Another window is showing it, so this one can't. */
  shownElsewhere: boolean;
  /** A name the user gave the page, shown instead of its title. */
  customTitle: string | null;
  note: string | null;
  /** Kept at the top of the trail; closing puts it to sleep instead. */
  isPinned: boolean;
  /** The group this top-level page is filed under, if any. */
  groupId: string | null;
  /** The mark a top-level trail was given, drawn in place of its site icon. */
  emoji?: string | null;
  /** When the page was last brought on screen. */
  lastActiveAt?: number;
  isAudible: boolean;
  isMuted: boolean;
  /** A video floating above other windows, or one playing that could. */
  video?: VideoActivity;
  zoomPercent: number;
  find: FindResult | null;
  isUnresponsive: boolean;
  hasFormEdits?: boolean;
  /** On a site the user chose to use despite its certificate. */
  certificateException?: boolean;
  /** Permissions this page asked for and was refused, for the address bar. */
  blockedPermissions: SitePermission[];
  /** Addresses this page tried to open without being asked, newest last. */
  blockedPopups: string[];
  /** A permission request waiting for the user's answer. */
  permissionRequest: PermissionRequest | null;
}

/** What a page's videos are doing, as far as picture in picture goes. */
export type VideoActivity = 'none' | 'playing' | 'floating';

/** Site permissions the user can decide on. */
/** The permissions macOS decides for the whole app, above any one site. */
export type SystemPermission = 'camera' | 'microphone' | 'location';

export type SitePermission =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  /** Windows a site opens that the user didn't click for. */
  | 'popups'
  | 'midi'
  | 'clipboard'
  | 'sound'
  /** Whether Splash offers to keep logins used on this site. */
  | 'save-passwords'
  /** A site's scripts floating a video in its own small window. */
  | 'picture-in-picture'
  /** Allowed means ads and trackers aren't blocked on the site. */
  | 'ads'
  /** Links that open an app on the Mac: mailto:, tel:, zoommtg: … */
  | 'apps'
  /** Allowed means HTTPS-only mode leaves the site's plain HTTP address alone. */
  | 'insecure'
  /** Scripts on the site's pages and everything they embed. */
  | 'javascript'
  | 'images'
  /** Audio and video starting before the user touched the page. */
  | 'autoplay'
  /** Cookies of other sites while on this one. */
  | 'third-party-cookies'
  /** The user chose to visit a site the lists report as dangerous. */
  | 'dangerous'
  /** The user chose to use a site despite its certificate. */
  | 'certificate';

export type PermissionDecision = 'allow' | 'block' | 'ask';

export interface SiteInfo {
  origin: string;
  host: string;
  security: 'secure' | 'insecure';
  /** Ads and trackers blocked since the page last loaded. */
  blockedCount: number;
  /** Allowed here, but macOS isn't letting Splash have it on this page. */
  refusedBySystem: SystemPermission[];
  permissions: {
    permission: SitePermission;
    label: string;
    decision: PermissionDecision;
    /** Decided for the site, or something the page asked for or used. */
    inUse: boolean;
  }[];
}

/** The headed groups the command palette shows its results in. */
export type PaletteSection =
  | 'go'
  | 'pinned'
  | 'pages'
  | 'workspaces'
  | 'commands'
  | 'bookmarks'
  | 'history'
  | 'search';

/** One row in the command palette or the address bar's suggestions. */
export type PaletteItem = {
  id: string;
  title: string;
  subtitle: string;
  section: PaletteSection;
} & (
  | {
      kind: 'page';
      pageId: PageId;
      faviconUrl: string | null;
      /** Set when the page lives in another workspace. */
      workspaceName: string | null;
    }
  | {
      kind: 'workspace';
      workspaceId: WorkspaceId;
      appearance: WorkspaceAppearance;
      shortcut: string | null;
    }
  | {
      kind: 'history' | 'bookmark';
      url: string;
      faviconUrl: string | null;
    }
  | {
      kind: 'navigate';
      input: string;
      /** The site's icon, when the row goes to an address seen before. */
      faviconUrl?: string | null;
      /**
       * Set when the row completes what was typed into an address from
       * history: the text the field fills in.
       */
      completion?: string;
    }
  | {
      /** A search the engine suggested; `url` runs it. */
      kind: 'search';
      url: string;
    }
  | {
      kind: 'command';
      command: PaletteCommand;
      shortcut: string | null;
    }
);

export type PaletteCommand =
  | 'open-file'
  | 'new-private-window'
  | 'manage-passwords'
  | 'import-data'
  | 'export-bookmarks'
  | 'export-trail'
  | 'picture-in-picture'
  | 'new-page'
  | 'new-child-page'
  | 'new-sibling-page'
  | 'collapse-other-trails'
  | 'import-trail'
  | 'paste-outline'
  | 'show-trail-summary'
  | 'new-workspace'
  | 'customize-workspace'
  | 'reopen-closed'
  | 'close-page'
  | 'toggle-sidebar'
  | 'find'
  | 'zoom-reset'
  | 'mute-page'
  | 'site-info'
  | 'toggle-split'
  | 'pin-page'
  | 'reload'
  | 'duplicate-page'
  | 'copy-link'
  | 'copy-markdown'
  | 'copy-text'
  | 'paste-and-go'
  | 'go-home'
  | 'close-branch'
  | 'rename-page'
  | 'edit-note'
  | 'show-downloads'
  | 'show-history'
  | 'show-bookmarks'
  | 'show-tasks'
  | 'show-notes'
  /** PROTOTYPE: see src/renderer/prototype/. */
  | 'show-alma-view'
  | 'toggle-bookmarks-bar'
  | 'bookmark-branch'
  | 'open-settings'
  | 'zoom-in'
  | 'zoom-out'
  | 'go-back'
  | 'go-forward'
  | 'print'
  | 'save-page'
  | 'close-others'
  | 'close-below'
  | 'view-source'
  | 'dev-tools'
  | 'filter-pages'
  | 'toggle-ai-panel'
  | 'close-split'
  | 'rename-workspace'
  | 'delete-workspace'
  | 'clear-pages'
  | 'reveal-page'
  | 'next-workspace'
  | 'previous-workspace'
  | 'toggle-full-screen'
  | 'toggle-dark-mode'
  | 'show-shortcuts';

export type DownloadState =
  | 'progressing'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  /** Finished, but the file has since been moved or deleted. */
  | 'missing';

/** A site in the browsing history: one entry per address. */
export interface HistoryEntry {
  faviconUrl?: string | null;
  url: string;
  title: string;
  visitCount: number;
  lastVisitedAt: number;
}

export interface DownloadSummary {
  id: string;
  /** The page that started it, while that page exists. */
  pageId: PageId | null;
  url: string;
  filename: string;
  savePath: string | null;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  /** How fast it's arriving right now; 0 unless it's progressing. */
  bytesPerSecond: number;
  startedAt: number;
  /** Why it stopped, in plain words, for interrupted downloads. */
  problem: string | null;
  /** The file can run code; opening it asks first. */
  runnable: boolean;
}

export type DownloadAction =
  | 'cancel'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'open'
  | 'show'
  | 'remove';

export interface SiteSettings {
  origin: string;
  host: string;
  permissions: {
    permission: SitePermission;
    label: string;
    decision: PermissionDecision;
  }[];
}

/** A cookie as the viewer shows it. Values never leave the main process. */
export interface CookieEntry {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** Milliseconds since the epoch; `null` when it ends with the session. */
  expires: number | null;
}

/** One site's cookies, including its subdomains'. */
export interface CookieSite {
  site: string;
  cookies: CookieEntry[];
}

export interface CookieDeletion {
  deleted: number;
  undoToken: string | null;
}

/** Whether the ad and tracker filter lists are ready to use. */
export interface ContentBlockingStatus {
  state: 'loading' | 'ready' | 'failed';
  /** When the lists in use were downloaded. */
  updatedAt: number | null;
  /** The last try to download newer lists failed. */
  updateFailed: boolean;
}

/** Whether the phishing and malware lists are ready to use. */
export interface ThreatListStatus {
  state: 'off' | 'loading' | 'ready' | 'failed';
  /** When the lists in use were downloaded. */
  updatedAt: number | null;
  /** The last try to download newer lists failed. */
  updateFailed: boolean;
  /** How many reported sites the lists hold. */
  count: number;
}

export interface DefaultBrowserStatus {
  isDefault: boolean;
  /** Only the installed app can register itself with macOS. */
  canChange: boolean;
}

export type ExtensionSource = 'bundled' | 'store' | 'unpacked';

/** One row of the Extensions settings. */
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  source: ExtensionSource;
  enabled: boolean;
  /** A `data:` address, so it still draws while the extension is off. */
  iconUrl: string | null;
  optionsUrl: string | null;
  storeUrl: string | null;
  /** What it can reach, in plain words, most serious first. */
  warnings: string[];
}

/** Licence texts Settings › About can show. */
export type LicenceName = 'splash' | 'third-party';

/** Addresses Settings › About links to, opened as Splash pages. */
export type AboutLink = 'source' | 'ublock-source' | 'gpl';

export interface AboutInfo {
  version: string;
  /** Crash reports kept on this Mac; they're never uploaded. */
  crashReports: number;
  electron: string;
  chromium: string;
  dataFolder: string;
}

export interface StorageStatus {
  /** Why saving the session is failing; `null` while saves succeed. */
  problem: string | null;
}

export type ClearRange = 'hour' | 'day' | 'week' | 'all';

export interface ClearDataRequest {
  range: ClearRange;
  history: boolean;
  cookies: boolean;
  cache: boolean;
  permissions: boolean;
  downloads: boolean;
}

export interface PermissionRequest {
  id: string;
  origin: string;
  permissions: SitePermission[];
  /** For `apps`: the app the link would open, and its kind of link. */
  opens?: ExternalApp;
}

/** An app on the Mac that a page's link would open. */
export interface ExternalApp {
  /** As macOS names it: "Mail", "FaceTime", "zoom.us". */
  app: string;
  /** The link's scheme, lowercased, without its colon: "mailto". */
  scheme: string;
}

/** How a workspace marks itself in the sidebar. */
export type WorkspaceIcon =
  | { kind: 'letter' }
  | { kind: 'symbol'; name: string }
  | { kind: 'emoji'; value: string }
  /** A small square PNG, as a data URL. */
  | { kind: 'image'; dataUrl: string };

/**
 * Light or dark for a workspace: `default` takes the Theme in Settings,
 * `system` follows macOS.
 */
export type WorkspaceMode = 'default' | 'light' | 'dark' | 'system';

/** A workspace's look; ids refer to the presets in `shared/appearance.ts`. */
export interface WorkspaceAppearance {
  icon: WorkspaceIcon;
  /** An accent preset id, or a custom `#rrggbb` colour. */
  accent: string;
  frame: string;
  /** A gradient preset painted over the frame; missing means none. */
  gradient?: string;
  /**
   * One to three `#rrggbb` colours picked on the colour wheel, painted over
   * the frame as a gradient in place of a preset. The first is the accent.
   */
  colors?: string[];
  /** How strongly the colours show, 0–1; missing means `INTENSITY`. */
  intensity?: number;
  /** How much grain lies over the frame, 0–1; missing means the default. */
  grain?: number;
  mode: WorkspaceMode;
}

export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
  pageCount: number;
  appearance: WorkspaceAppearance;
}

/** The most recent close that can be undone. */
export interface ClosedSummary {
  kind: 'pages' | 'workspace' | 'group';
  label: string;
  pageCount: number;
  /** Changes with every close, so the shell can tell a new one apart. */
  serial: number;
  /** The first page's address and icon. Missing in older records. */
  url?: string | null;
  faviconUrl?: string | null;
  /** A redo closed it again; the shell confirms that itself. */
  redone?: boolean;
  /** A download left the page empty, so it closed; `label` is the file. */
  forDownload?: boolean;
}

/** Two pages of one workspace shown side by side. */
export interface SplitView {
  leftId: PageId;
  rightId: PageId;
}

/** A named set of top-level pages in a workspace; its pages are ordinary pages, just filed together. */
export interface PageGroup {
  id: string;
  name: string;
  collapsed: boolean;
  /** What marks it in the trail; a folder when there's none. */
  icon?: GroupIcon;
}

/** A group's mark: an emoji, drawn like a workspace's. */
export type GroupIcon = Extract<WorkspaceIcon, { kind: 'emoji' }>;

export interface OtherWindow {
  id: string;
  title: string;
}

/** The window's state as the shell renders it: the active workspace's trail. */
export interface BrowserSnapshot {
  pages: Record<PageId, PageSnapshot>;
  rootIds: PageId[];
  /** The workspace's groups, in the order they show. */
  groups: PageGroup[];
  activePageId: PageId | null;
  /** The workspace's split view; on screen while either of its pages is active. */
  split: SplitView | null;
  /** The other windows, each with what it's showing. */
  otherWindows: OtherWindow[];
  lastClosed: ClosedSummary | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: WorkspaceId;
  /**
   * The profile the active workspace's pages browse in: their partition is
   * `persist:<activeProfile>`. Absent where workspaces have no profiles.
   */
  activeProfile?: string;
}

/** Distance from each window edge to the page content area, in CSS pixels. */
export interface ContentInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Where a page was before it moved to another workspace, to put it back. */
export interface MoveOrigin {
  workspaceId: WorkspaceId;
  parentId: PageId | null;
  /** Position among its siblings. */
  index: number;
  /** It was its workspace's active page. */
  wasActive: boolean;
}

/** A place in a workspace's trail: under `parentId`, at `index`. */
export interface TrailPosition {
  parentId: PageId | null;
  /** Position among its siblings. */
  index: number;
}

/** Something done outside the shell UI that the shell confirms in a toast. */
export type Notice =
  | { kind: 'page-saved'; filename: string }
  /** A word from the page menu's spelling items, kept or refused. */
  | { kind: 'word-added' | 'word-not-added'; word: string }
  /** Everything but one trail was collapsed; empty when nothing changed. */
  | { kind: 'trails-collapsed'; pageIds: PageId[]; groupIds: string[] }
  /** A Markdown outline came in as pages. */
  | {
      kind: 'trail-imported';
      label: string;
      pageCount: number;
      /** What it added at the top of its place, to go there or take it out. */
      pageIds: PageId[];
      /** Set when it came in as a group of several trails. */
      groupId: string | null;
      /** Links kept as plain names, since they weren't web addresses. */
      skippedAddresses: number;
    }
  | {
      kind: 'trail-not-imported';
      reason: 'empty' | 'too-long' | 'unreadable';
      /** The file's name; `null` for the clipboard. */
      source: string | null;
    }
  /** Splash reopened after a while, with several trails to go back to. */
  | { kind: 'come-back'; trailCount: number; trail: string; page: string }
  /** Bookmarks or a trail were written to a file. */
  | { kind: 'exported'; filename: string }
  /** A login was kept, after asking or because Splash made its password. */
  | { kind: 'password-saved'; host: string }
  /** A site asked for a passkey, and no authenticator in Splash can answer. */
  | { kind: 'passkey-unavailable'; host: string }
  /** The site was allowed something, and macOS hasn't allowed it to Splash. */
  | {
      kind: 'system-permission-refused';
      permissions: SystemPermission[];
      host: string;
    }
  /** A page had no video to float, or its site doesn't allow it. */
  | { kind: 'no-video'; blocked: boolean }
  | { kind: 'no-article' }
  /** A file can't be shown as a page. */
  | { kind: 'cannot-open-file'; filename: string }
  /** A native helper an extension needs ended as soon as it started. */
  | { kind: 'helper-ended'; extension: string }
  /** The window's interface crashed and was reloaded; pages kept running. */
  | { kind: 'shell-recovered' }
  /** Splash has been used for a few days and could open links from other apps. */
  | { kind: 'default-browser-offer' }
  /** Paste and Go, with no text on the clipboard. */
  | { kind: 'nothing-to-paste' }
  /** A page's link needs an app this Mac doesn't have. */
  | { kind: 'no-app'; scheme: string }
  | {
      kind: 'copied';
      what: 'link' | 'image' | 'image-address' | 'markdown' | 'text';
      /** The page or host the link points to; `null` to say nothing more. */
      subject: string | null;
    }
  | {
      kind: 'moved';
      pageId: PageId;
      label: string;
      /** The page and everything beneath it. */
      pageCount: number;
      workspaceId: WorkspaceId;
      workspaceName: string;
      origin: MoveOrigin;
      /** Where it landed in the new workspace, for redo. */
      index: number;
    }
  | {
      kind: 'pinned';
      pageId: PageId;
      label: string;
      /** Pinned, or unpinned. */
      pinned: boolean;
      /** Where it was before, for undo. */
      origin: TrailPosition;
      /** Where it landed, for redo. */
      at: TrailPosition;
    }
  /** A page that came back by itself tried to download a file, and waits. */
  | { kind: 'download-held'; pageId: PageId; host: string; filename: string }
  | {
      /** Closing a pinned page kept it in the trail. */
      kind: 'kept-pinned';
      pageId: PageId;
      label: string;
      /** It went to sleep; false when it was the only page left. */
      asleep: boolean;
    };

/** Sections other windows can send Settings to. */
export type SettingsSection = 'passwords' | 'transfer';

/** A browser on this Mac that Splash can bring things over from. */
export interface ImportSource {
  id: string;
  browser: string;
  /** The profile's name, for browsers that have them. */
  profile: string | null;
  hasBookmarks: boolean;
  hasHistory: boolean;
  /** macOS keeps other apps out of its folder. */
  blocked: boolean;
}

export interface ImportResult {
  summary: string;
  details: string[];
  undoToken: string | null;
  /** Offers to move an unencrypted password export to the Trash. */
  trashToken: string | null;
}

/** Commands the main process asks the shell UI to perform (usually from a menu). */
export type UiCommand =
  /** The palette as the location field, for the active page. */
  | { type: 'open-location' }
  | { type: 'toggle-sidebar' }
  | { type: 'rename-page'; pageId: PageId }
  | { type: 'edit-note'; pageId: PageId }
  | { type: 'rename-workspace' }
  /** Opens the workspace editor: for a new workspace, or the active one. */
  | { type: 'create-workspace' }
  | { type: 'customize-workspace' }
  /** `query` opens it already typed: `?` for the shortcut sheet. */
  | { type: 'open-palette'; query?: string }
  /** Something done from a native menu made the open overlay pointless. */
  | { type: 'close-overlay' }
  | { type: 'site-info' }
  | { type: 'find'; action: 'open' | 'next' | 'previous' }
  | { type: 'show-downloads' }
  | { type: 'show-history' }
  | { type: 'show-bookmarks' }
  | { type: 'show-tasks' }
  | { type: 'show-notes' }
  /** PROTOTYPE: see src/renderer/prototype/. */
  | { type: 'show-alma-view' }
  | { type: 'show-trail-summary' }
  /** Edit › Undo while the shell has focus: text first, then the trail. */
  /** `trail` goes straight to the trail, whatever field the shell has focused. */
  | { type: 'undo'; trail?: boolean }
  | { type: 'filter-trail' }
  | { type: 'toggle-ai-panel' }
  | { type: 'redo'; trail?: boolean };
