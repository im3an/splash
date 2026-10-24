export type PageId = string;

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
}

export interface BrowserSnapshot {
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

/** Commands the main process asks the shell UI to perform (usually from the app menu). */
export type UiCommand = 'focus-address-bar' | 'toggle-sidebar';
