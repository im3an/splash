import type { Rectangle } from 'electron';
import type {
  ExternalApp,
  FindResult,
  Notice,
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
  /** Page zoom in percent; shared across a site and remembered for it. */
  zoomPercent: number;
  /** The latest find-in-page result, while a search is open. */
  find: FindResult | null;
  /** The page's renderer has stopped responding. */
  isUnresponsive: boolean;
  /** Edited documents are kept awake; this does not claim a save status. */
  hasFormEdits?: boolean;
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
  /** Typed with no scheme, so HTTP can be offered if this HTTPS load fails. */
  plainAddress?: string;
}

export interface PageHostEvents {
  /** The trail page this host shows. */
  readonly pageId: PageId;
  onStateChange(patch: Partial<PageRuntimeState>): void;
  /** The page asked to open a new window (`window.open`, `target=_blank`). */
  onOpenRequest(url: string, options: { background: boolean }): void;
  /** A popup was stopped; `url` is `null` for one with no address yet. */
  onPopupBlocked(url: string | null): void;
  /** The user zoomed this page, and with it the rest of its site. */
  onZoomChange(percent: number): void;
  /** The user clicked a link; the trail grows a child page instead. */
  onBranchRequest(url: string, referrer: string): void;
  /** Back/forward/reload from inside the page (its context menu). */
  onNavigationCommand(command: 'back' | 'forward' | 'reload'): void;
  /** Whether back/forward lead anywhere, counting the trail. */
  navigationAvailability(): { canGoBack: boolean; canGoForward: boolean };
  /** The page took keyboard focus, usually because it was clicked. */
  onFocus(): void;
  /** The page asks for permissions nobody has decided on yet. */
  onPermissionRequest(
    origin: string,
    permissions: SitePermission[],
    opens?: ExternalApp,
  ): Promise<boolean>;
  /** The page was refused something, without asking. */
  onPermissionBlocked(permissions: SitePermission[]): void;
  /** Something the user did in the page's own menu worth confirming. */
  onNotice(notice: Notice): void;
  /** The page put itself in full screen (a video), or left it. */
  onFullscreenChange(active: boolean): void;
}

/**
 * Displays one page. The controller owns trail structure and decides which
 * host is visible; a host only renders content and reports what happens.
 */
export interface PageHost {
  load(url: string, options?: LoadOptions): void;
  goBack(): void;
  goForward(): void;
  /** `ignoreCache` fetches everything again, like a hard reload. */
  reload(options?: { ignoreCache?: boolean }): void;
  stop(): void;
  /** Opens the system print dialog for the page. */
  print(): void;
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
  /** Goes back to the zoom settings say this page should have. */
  applySiteZoom(): void;
  find(text: string, options: { forward: boolean; findNext: boolean }): void;
  stopFind(): void;
  /** A still image of what the page shows, as a data URL. */
  capture(): Promise<string | null>;
  /** Runs the native beforeunload lifecycle. True means the view has closed. */
  requestClose?(): Promise<boolean>;
  destroy(): void;
}

export type PageHostFactory = (events: PageHostEvents) => PageHost;
