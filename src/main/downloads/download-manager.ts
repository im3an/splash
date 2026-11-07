import { basename } from 'node:path';
import { isActiveDownload } from '../../shared/downloads';
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
  getCurrentBytesPerSecond(): number;
  isPaused(): boolean;
  canResume(): boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
  on(event: 'updated' | 'done', listener: () => void): unknown;
  off(event: 'updated' | 'done', listener: () => void): unknown;
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
  /** Detaches the session that supplied these downloads. */
  onDispose?(): void;
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
  release?(): void;
}

/**
 * Tracks every download: where it is saved, how far it got, why it
 * stopped, and the actions that make sense for it. The list is saved so
 * it survives a restart.
 */
export class DownloadManager {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;

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
    if (this.disposed) throw new Error('Download manager is disposed');
    const id = this.options.createId();
    if (!this.options.askWhereToSave()) {
      const reserved = new Set(
        [...this.entries.values()]
          .filter(({ item }) => item !== null)
          .map(({ summary }) => summary.savePath),
      );
      item.setSavePath(
        uniqueFilePath(
          this.options.downloadsFolder(),
          item.getFilename(),
          (path) => reserved.has(path) || this.options.exists(path),
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
      bytesPerSecond: 0,
      startedAt: this.options.now(),
      problem: null,
      runnable: isRunnableFile(item.getFilename()),
    };
    const updated = () => this.refresh(id);
    const done = () => this.refresh(id, true);
    this.entries.set(id, {
      summary,
      item,
      release: () => {
        item.off('updated', updated);
        item.off('done', done);
      },
    });
    this.persist(summary);
    item.on('updated', updated);
    item.on('done', done);
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
    let count = 0;
    for (const { summary } of this.entries.values()) {
      if (summary.state === 'progressing') count++;
    }
    return count;
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
        if (isActiveDownload(summary)) item?.cancel();
        this.remove(id);
        return;
    }
  }

  /** Removes every download that is no longer running from the list. */
  clearFinished(): void {
    for (const summary of this.list()) {
      if (!isActiveDownload(summary)) {
        this.remove(summary.id);
      }
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Ends a discarded profile's downloads before its store is closed. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.options.onDispose?.();
    this.listeners.clear();
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) {
      entry.release?.();
      try {
        entry.item?.cancel();
      } catch (error) {
        console.warn('Could not cancel a discarded download', error);
      }
    }
  }

  private remove(id: string): void {
    this.entries.get(id)?.release?.();
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
    const savePath = item.getSavePath() || entry.summary.savePath;
    const filename = savePath ? basename(savePath) : entry.summary.filename;
    const state: DownloadState =
      raw === 'progressing' && item.isPaused() ? 'paused' : raw;
    this.update(
      id,
      {
        state,
        savePath,
        filename,
        runnable: entry.summary.runnable || isRunnableFile(filename),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        bytesPerSecond:
          state === 'progressing' ? item.getCurrentBytesPerSecond() : 0,
        problem: state === 'interrupted' ? interruptionProblem(item) : null,
      },
      done || state !== 'progressing',
    );
    if (done && state !== 'interrupted') {
      entry.release?.();
      delete entry.release;
      entry.item = null;
    }
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
    // Nothing is arriving after a restart, and older records have no speed.
    const stopped = {
      ...saved,
      pageId: null,
      bytesPerSecond: 0,
      runnable:
        saved.runnable || isRunnableFile(saved.savePath ?? saved.filename),
    };
    if (saved.state === 'progressing' || saved.state === 'paused') {
      return { ...stopped, state: 'interrupted', problem: QUIT_PROBLEM };
    }
    if (
      saved.state === 'completed' &&
      saved.savePath &&
      !this.options.exists(saved.savePath)
    ) {
      return {
        ...stopped,
        state: 'missing',
        problem: 'The file was moved or deleted. Retry downloads it again.',
      };
    }
    return stopped;
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
