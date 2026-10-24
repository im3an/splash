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
}

export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
  pageCount: number;
}

/** The most recent close that can be undone. */
export interface ClosedSummary {
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
  | { type: 'rename-workspace' };
