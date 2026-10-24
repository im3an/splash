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
  isAudible: boolean;
  isMuted: boolean;
  zoomPercent: number;
  find: FindResult | null;
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
  | 'sound';

export type PermissionDecision = 'allow' | 'block' | 'ask';

export interface SiteInfo {
  origin: string;
  host: string;
  security: 'secure' | 'insecure';
  permissions: {
    permission: SitePermission;
    label: string;
    decision: PermissionDecision;
  }[];
}

/** One row in the command palette or the address bar's suggestions. */
export type PaletteItem =
  | {
      kind: 'page';
      id: string;
      pageId: PageId;
      title: string;
      subtitle: string;
      faviconUrl: string | null;
      /** Set when the page lives in another workspace. */
      workspaceName: string | null;
    }
  | {
      kind: 'history';
      id: string;
      url: string;
      title: string;
      subtitle: string;
    }
  | {
      kind: 'navigate';
      id: string;
      input: string;
      title: string;
      subtitle: string;
    }
  | {
      kind: 'command';
      id: string;
      command: PaletteCommand;
      title: string;
      subtitle: string;
      shortcut: string | null;
    };

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
  | 'site-info';

export interface PermissionRequest {
  id: string;
  origin: string;
  permissions: SitePermission[];
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

/** The window's state as the shell renders it: the active workspace's trail. */
export interface BrowserSnapshot {
  pages: Record<PageId, PageSnapshot>;
  rootIds: PageId[];
  activePageId: PageId | null;
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

/** Commands the main process asks the shell UI to perform (usually from a menu). */
export type UiCommand =
  | { type: 'focus-address-bar' }
  | { type: 'toggle-sidebar' }
  | { type: 'rename-page'; pageId: PageId }
  | { type: 'edit-note'; pageId: PageId }
  | { type: 'rename-workspace' }
  /** Opens the workspace editor: for a new workspace, or the active one. */
  | { type: 'create-workspace' }
  | { type: 'customize-workspace' }
  | { type: 'open-palette' }
  | { type: 'site-info' }
  | { type: 'find'; action: 'open' | 'next' | 'previous' };
