export type PageId = string;
export type WorkspaceId = string;

export type PageErrorKind = 'load-failed' | 'crashed';

export interface PageError {
  kind: PageErrorKind;
  /** Chromium net error code for load failures, 0 otherwise. */
  code: number;
  description: string;
  url: string;
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
  /** A name the user gave the page, shown instead of its title. */
  customTitle: string | null;
  note: string | null;
  /** Kept at the top of the trail; closing puts it to sleep instead. */
  isPinned: boolean;
  isAudible: boolean;
  isMuted: boolean;
  zoomPercent: number;
  find: FindResult | null;
  isUnresponsive: boolean;
  hasFormEdits?: boolean;
  /** Permissions this page asked for and was refused, for the address bar. */
  blockedPermissions: SitePermission[];
  /** A permission request waiting for the user's answer. */
  permissionRequest: PermissionRequest | null;
}

/** Site permissions the user can decide on. */
export type SitePermission =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'midi'
  | 'clipboard'
  | 'sound'
  /** Allowed means ads and trackers aren't blocked on the site. */
  | 'ads'
  /** Links that open an app on the Mac: mailto:, tel:, zoommtg: … */
  | 'apps';

export type PermissionDecision = 'allow' | 'block' | 'ask';

export interface SiteInfo {
  origin: string;
  host: string;
  security: 'secure' | 'insecure';
  /** Ads and trackers blocked since the page last loaded. */
  blockedCount: number;
  permissions: {
    permission: SitePermission;
    label: string;
    decision: PermissionDecision;
  }[];
}

/** The headed groups the command palette shows its results in. */
export type PaletteSection =
  | 'go'
  | 'pinned'
  | 'pages'
  | 'workspaces'
  | 'commands'
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
      kind: 'history';
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
  | 'new-page'
  | 'new-child-page'
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
  | 'close-branch'
  | 'rename-page'
  | 'edit-note'
  | 'show-downloads'
  | 'show-history'
  | 'open-settings'
  | 'zoom-in'
  | 'zoom-out'
  | 'go-back'
  | 'go-forward'
  | 'print'
  | 'save-page'
  | 'close-others'
  | 'close-split'
  | 'rename-workspace'
  | 'delete-workspace';

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

/** Whether the ad and tracker filter lists are ready to use. */
export interface ContentBlockingStatus {
  state: 'loading' | 'ready' | 'failed';
  /** When the lists in use were downloaded. */
  updatedAt: number | null;
  /** The last try to download newer lists failed. */
  updateFailed: boolean;
}

export interface DefaultBrowserStatus {
  isDefault: boolean;
  /** Only the installed app can register itself with macOS. */
  canChange: boolean;
}

export interface AboutInfo {
  version: string;
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

/** Light or dark for a workspace; `system` follows the app's setting. */
export type WorkspaceMode = 'system' | 'light' | 'dark';

/** A workspace's look; ids refer to the presets in `shared/appearance.ts`. */
export interface WorkspaceAppearance {
  icon: WorkspaceIcon;
  /** An accent preset id, or a custom `#rrggbb` colour. */
  accent: string;
  frame: string;
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
  kind: 'pages' | 'workspace';
  label: string;
  pageCount: number;
  /** Changes with every close, so the shell can tell a new one apart. */
  serial: number;
}

/** Two pages of one workspace shown side by side. */
export interface SplitView {
  leftId: PageId;
  rightId: PageId;
}

/** The window's state as the shell renders it: the active workspace's trail. */
export interface BrowserSnapshot {
  pages: Record<PageId, PageSnapshot>;
  rootIds: PageId[];
  activePageId: PageId | null;
  /** The workspace's split view; on screen while either of its pages is active. */
  split: SplitView | null;
  lastClosed: ClosedSummary | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: WorkspaceId;
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
  /** The window's interface crashed and was reloaded; pages kept running. */
  | { kind: 'shell-recovered' }
  /** A page's link needs an app this Mac doesn't have. */
  | { kind: 'no-app'; scheme: string }
  | {
      kind: 'copied';
      what: 'link' | 'image' | 'image-address';
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
    }
  | {
      kind: 'pinned';
      pageId: PageId;
      label: string;
      /** Pinned, or unpinned. */
      pinned: boolean;
      /** Where it was before, for undo. */
      origin: TrailPosition;
    }
  | {
      /** Closing a pinned page kept it in the trail. */
      kind: 'kept-pinned';
      pageId: PageId;
      label: string;
      /** It went to sleep; false when it was the only page left. */
      asleep: boolean;
    };

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
  | { type: 'open-palette' }
  | { type: 'site-info' }
  | { type: 'find'; action: 'open' | 'next' | 'previous' }
  | { type: 'show-downloads' }
  | { type: 'show-history' };
