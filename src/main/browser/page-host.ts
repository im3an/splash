import type { Rectangle } from 'electron';
import type { PageError } from '../../shared/types';

/** Live state reported by a page's Chromium view. */
export interface PageRuntimeState {
  url: string | null;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  /** Within this page's own history; the trail adds parent/child steps. */
  canGoBack: boolean;
  canGoForward: boolean;
  error: PageError | null;
}

export interface HistoryEntry {
  url: string;
  title: string;
  /** Chromium's serialized scroll position and form state. */
  pageState?: string;
}

/** A page's back/forward list, kept when its view is discarded or saved. */
export interface PageHistory {
  entries: HistoryEntry[];
  index: number;
}

export interface LoadOptions {
  /** The page that led here, sent as the HTTP referrer. */
  referrer?: string;
}

export interface PageHostEvents {
  onStateChange(patch: Partial<PageRuntimeState>): void;
  /** The page asked to open a new window (`window.open`, `target=_blank`). */
  onOpenRequest(url: string, options: { background: boolean }): void;
  /** The user clicked a link; the trail grows a child page instead. */
  onBranchRequest(url: string, referrer: string): void;
}

/**
 * Displays one page. The controller owns trail structure and decides which
 * host is visible; a host only renders content and reports what happens.
 */
export interface PageHost {
  load(url: string, options?: LoadOptions): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  show(bounds: Rectangle): void;
  hide(): void;
  focus(): void;
  toggleDevTools(): void;
  /** `null` until something has been loaded. */
  captureHistory(): PageHistory | null;
  restoreHistory(history: PageHistory): void;
  /** Pages playing sound are never discarded. */
  isAudible(): boolean;
  destroy(): void;
}

export type PageHostFactory = (events: PageHostEvents) => PageHost;
