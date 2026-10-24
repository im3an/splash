import type { PageError } from '../shared/types';

/** Where a page view sits inside its window, in device-independent pixels. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Live state reported by a page's Chromium view. */
export interface PageRuntimeState {
  url: string | null;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: PageError | null;
}

export interface PageHostEvents {
  onStateChange(patch: Partial<PageRuntimeState>): void;
  /** The page asked to open a new window (`window.open`, `target=_blank`). */
  onOpenRequest(url: string, options: { background: boolean }): void;
}

/**
 * Displays one page. The controller owns trail structure and decides which
 * host is visible; a host only renders content and reports what happens.
 */
export interface PageHost {
  load(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  show(bounds: Bounds): void;
  hide(): void;
  focus(): void;
  toggleDevTools(): void;
  destroy(): void;
}

export type PageHostFactory = (events: PageHostEvents) => PageHost;
