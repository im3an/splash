import type { Rectangle } from 'electron';
import type {
  FindResult,
  PageError,
  PageId,
  SitePermission,
} from '../../shared/types';

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
  /** The page is producing sound right now. */
  isAudible: boolean;
  isMuted: boolean;
  /** Page zoom in percent; Chromium shares it across a site. */
  zoomPercent: number;
  /** The latest find-in-page result, while a search is open. */
  find: FindResult | null;
  /** The page's renderer has stopped responding. */
  isUnresponsive: boolean;
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
  /** The trail page this host shows. */
  readonly pageId: PageId;
  onStateChange(patch: Partial<PageRuntimeState>): void;
  /** The page asked to open a new window (`window.open`, `target=_blank`). */
  onOpenRequest(url: string, options: { background: boolean }): void;
  /** The user clicked a link; the trail grows a child page instead. */
  onBranchRequest(url: string, referrer: string): void;
  /** Back/forward/reload from inside the page (its context menu). */
  onNavigationCommand(command: 'back' | 'forward' | 'reload'): void;
  /** Whether back/forward lead anywhere, counting the trail. */
  navigationAvailability(): { canGoBack: boolean; canGoForward: boolean };
  /** The page asks for permissions nobody has decided on yet. */
  onPermissionRequest(
    origin: string,
    permissions: SitePermission[],
  ): Promise<boolean>;
  /** The page was refused something, without asking. */
  onPermissionBlocked(permissions: SitePermission[]): void;
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
  setMuted(muted: boolean): void;
  setZoomPercent(percent: number): void;
  find(text: string, options: { forward: boolean; findNext: boolean }): void;
  stopFind(): void;
  /** A still image of what the page shows, as a data URL. */
  capture(): Promise<string | null>;
  destroy(): void;
}

export type PageHostFactory = (events: PageHostEvents) => PageHost;
