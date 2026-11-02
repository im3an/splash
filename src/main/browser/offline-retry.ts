import type { BrowserSnapshot, PageId } from '../../shared/types';

/** Chromium's ERR_INTERNET_DISCONNECTED. */
const OFFLINE = -106;
const POLL_MS = 2000;

export interface OfflineRetryOptions {
  isOnline(): boolean;
  retry(pageId: PageId): void;
  setInterval?(run: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
}

/** The pages showing "You're offline". */
export function offlinePages(snapshot: BrowserSnapshot): PageId[] {
  return Object.values(snapshot.pages)
    .filter(
      (page) =>
        page.error?.kind === 'load-failed' && page.error.code === OFFLINE,
    )
    .map((page) => page.id);
}

/**
 * Retries pages that failed because the Mac was offline once the connection
 * comes back. It only polls while such a page exists, and only retries after
 * it has seen the connection down, so a page that fails while the Mac claims
 * to be online isn't retried in a loop.
 */
export class OfflineRetry {
  private waiting: PageId[] = [];
  private timer: unknown = null;
  private sawOffline = false;
  private readonly schedule: (run: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  constructor(private readonly options: OfflineRetryOptions) {
    this.schedule = options.setInterval ?? ((run, ms) => setInterval(run, ms));
    this.cancel =
      options.clearInterval ??
      ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  /** Call with every snapshot. */
  update(snapshot: BrowserSnapshot): void {
    this.waiting = offlinePages(snapshot);
    if (this.waiting.length === 0) {
      this.stop();
      return;
    }
    if (this.timer === null) {
      this.sawOffline = !this.options.isOnline();
      this.timer = this.schedule(() => this.poll(), POLL_MS);
    }
  }

  dispose(): void {
    this.stop();
  }

  private poll(): void {
    if (!this.options.isOnline()) {
      this.sawOffline = true;
      return;
    }
    if (!this.sawOffline) return;
    const pages = this.waiting;
    this.stop();
    for (const pageId of pages) this.options.retry(pageId);
  }

  private stop(): void {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.sawOffline = false;
  }
}
