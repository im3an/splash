import type { CommandId } from './commands';

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
  /** The title the page itself reports. */
  title: string;
  /** A name the user gave the page; shown instead of `title` when set. */
  customTitle: string | null;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  collapsed: boolean;
  error: PageError | null;
}

export const WORKSPACE_COLORS = [
  'clay',
  'moss',
  'sky',
  'plum',
  'sand',
  'slate',
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export interface WorkspaceSummary {
  id: WorkspaceId;
  name: string;
  color: WorkspaceColor;
  pageCount: number;
}

/**
 * Everything the shell renders. Workspaces each own an independent trail;
 * only the active workspace's pages are included.
 */
export interface BrowserSnapshot {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: WorkspaceId;
  pages: Record<PageId, PageSnapshot>;
  rootIds: PageId[];
  activePageId: PageId | null;
}

/** Distance from each window edge to the page content area, in CSS pixels. */
export interface ContentInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Appearance = 'system' | 'light' | 'dark';

/** Commands the main process asks the shell UI to perform (usually from the app menu). */
export type UiCommand = CommandId;
