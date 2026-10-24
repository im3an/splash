import type {
  DownloadAction,
  DownloadState,
  DownloadSummary,
  PageId,
} from '../../shared/types';
import type { TrailStore } from '../storage/trail-store';
import { isRunnableFile, uniqueFilePath } from './download-files';

/** The parts of Electron's `DownloadItem` the manager uses. */
export interface DownloadItemLike {
  getURL(): string;
  getFilename(): string;
  getSavePath(): string;
  setSavePath(path: string): void;
  getState(): 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  getReceivedBytes(): number;
  getTotalBytes(): number;
  isPaused(): boolean;
  canResume(): boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
  on(event: 'updated' | 'done', listener: () => void): unknown;
}

export interface DownloadManagerOptions {
  store: Pick<TrailStore, 'loadDownloads' | 'saveDownload' | 'deleteDownload'>;
  /** Where files go unless the user asked to choose each time. */
  downloadsFolder(): string;
  askWhereToSave(): boolean;
  exists(path: string): boolean;
  /** Starts the download of `url` again, from scratch. */
  restart(url: string): void;
  openFile(path: string): Promise<void>;
  showFile(path: string): void;
  /** Asks before opening a file that can run code. */
  confirmOpenRunnable(download: DownloadSummary): Promise<boolean>;
  createId(): string;
  now(): number;
}

const QUIT_PROBLEM = 'Splash quit before it finished.';

function interruptionProblem(item: DownloadItemLike): string {
  return item.canResume()
    ? 'The connection dropped or the site stopped sending. Retry picks up where it stopped.'
    : 'The connection dropped or the site stopped sending. Retry starts again.';
}

interface Entry {
  summary: DownloadSummary;
  item: DownloadItemLike | null;
}

/**
 * Tracks every download: where it is saved, how far it got, why it
 * stopped, and the actions that make sense for it. The list is saved so
 * it survives a restart.
 */
export class DownloadManager {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: DownloadManagerOptions) {
    for (const saved of this.safely(() => options.store.loadDownloads()) ??
      []) {
      const summary = this.reconcile(saved);
      this.entries.set(summary.id, { summary, item: null });
      if (summary !== saved) this.persist(summary);
    }
  }

  /** Starts tracking a download Chromium is about to begin. */
  track(item: DownloadItemLike, pageId: PageId | null): string {
    const id = this.options.createId();
    if (!this.options.askWhereToSave()) {
      item.setSavePath(
        uniqueFilePath(
          this.options.downloadsFolder(),
          item.getFilename(),
          this.options.exists,
        ),
      );
    }
    const summary: DownloadSummary = {
      id,
      pageId,
      url: item.getURL(),
      filename: item.getFilename(),
      savePath: item.getSavePath() || null,
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: this.options.now(),
      problem: null,
      runnable: isRunnableFile(item.getFilename()),
    };
    this.entries.set(id, { summary, item });
    this.persist(summary);
    item.on('updated', () => this.refresh(id));
    item.on('done', () => this.refresh(id, true));
    this.changed();
    return id;
  }

  /** Newest first. */
  list(): DownloadSummary[] {
    return [...this.entries.values()]
      .map((entry) => entry.summary)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  get activeCount(): number {
    return this.list().filter((d) => d.state === 'progressing').length;
  }

  async act(id: string, action: DownloadAction): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    const { summary, item } = entry;
    switch (action) {
      case 'cancel':
        item?.cancel();
        return;
      case 'pause':
        item?.pause();
        this.refresh(id);
        return;
      case 'resume':
        item?.resume();
        this.refresh(id);
        return;
      case 'retry':
        if (item?.canResume()) {
          item.resume();
          this.refresh(id);
        } else {
          this.remove(id);
          this.options.restart(summary.url);
        }
        return;
      case 'open':
        if (!summary.savePath || !this.checkFile(id)) return;
        if (
          summary.runnable &&
          !(await this.options.confirmOpenRunnable(summary))
        ) {
          return;
        }
        await this.options.openFile(summary.savePath);
        return;
      case 'show':
        if (summary.savePath && this.checkFile(id)) {
          this.options.showFile(summary.savePath);
        }
        return;
      case 'remove':
        if (summary.state === 'progressing') item?.cancel();
        this.remove(id);
        return;
    }
  }

  /** Removes every download that is no longer running from the list. */
  clearFinished(): void {
    for (const summary of this.list()) {
      if (summary.state !== 'progressing' && summary.state !== 'paused') {
        this.remove(summary.id);
      }
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private remove(id: string): void {
    this.entries.delete(id);
    this.safely(() => this.options.store.deleteDownload(id));
    this.changed();
  }

  /** A completed download whose file is gone is marked missing. */
  private checkFile(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry?.summary.savePath) return false;
    if (this.options.exists(entry.summary.savePath)) return true;
    this.update(id, {
      state: 'missing',
      problem: 'The file was moved or deleted. Retry downloads it again.',
    });
    return false;
  }

  private refresh(id: string, done = false): void {
    const entry = this.entries.get(id);
    if (!entry?.item) return;
    const { item } = entry;
    const raw = item.getState();
    const state: DownloadState =
      raw === 'progressing' && item.isPaused() ? 'paused' : raw;
    this.update(
      id,
      {
        state,
        savePath: item.getSavePath() || entry.summary.savePath,
        filename: item.getSavePath()
          ? (item.getSavePath().split('/').pop() ?? entry.summary.filename)
          : entry.summary.filename,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        problem: state === 'interrupted' ? interruptionProblem(item) : null,
      },
      done || state !== 'progressing',
    );
    if (done && state !== 'interrupted') entry.item = null;
  }

  private update(
    id: string,
    patch: Partial<DownloadSummary>,
    persist = true,
  ): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.summary = { ...entry.summary, ...patch };
    if (persist) this.persist(entry.summary);
    this.changed();
  }

  /** Corrects a saved entry for what happened while Splash was closed. */
  private reconcile(saved: DownloadSummary): DownloadSummary {
    if (saved.state === 'progressing' || saved.state === 'paused') {
      return {
        ...saved,
        state: 'interrupted',
        problem: QUIT_PROBLEM,
        pageId: null,
      };
    }
    if (
      saved.state === 'completed' &&
      saved.savePath &&
      !this.options.exists(saved.savePath)
    ) {
      return {
        ...saved,
        state: 'missing',
        problem: 'The file was moved or deleted. Retry downloads it again.',
        pageId: null,
      };
    }
    return { ...saved, pageId: null };
  }

  private persist(summary: DownloadSummary): void {
    this.safely(() => this.options.store.saveDownload(summary));
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private safely<T>(run: () => T): T | null {
    try {
      return run();
    } catch (error) {
      console.error('Download storage error', error);
      return null;
    }
  }
}
