import type { StoredSession, TrailStore } from './trail-store';

export interface SessionPersisterOptions {
  store: TrailStore;
  exportSession(): StoredSession;
  /** Quiet period after the last change before writing. */
  delayMs?: number;
  /** Saves happen at least this often, to keep scroll positions current. */
  intervalMs?: number;
  onError?(error: unknown): void;
}

/**
 * Writes the session to the store shortly after changes settle, regularly
 * while browsing, and immediately on `flush()` (quit, window close).
 * A failed write is reported and retried with the next change.
 */
export class SessionPersister {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly interval: ReturnType<typeof setInterval>;
  private dirty = false;

  constructor(private readonly options: SessionPersisterOptions) {
    this.interval = setInterval(() => {
      this.dirty = true;
      this.flush();
    }, options.intervalMs ?? 30_000);
    this.interval.unref?.();
  }

  schedule(): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.delayMs ?? 600);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    try {
      this.options.store.saveSession(this.options.exportSession());
    } catch (error) {
      this.dirty = true;
      this.options.onError?.(error);
    }
  }

  dispose(): void {
    this.flush();
    clearInterval(this.interval);
  }
}
