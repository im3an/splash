import { EventEmitter } from 'node:events';
import type { DownloadSummary } from '../../shared/types';
import {
  DownloadManager,
  type DownloadItemLike,
  type DownloadManagerOptions,
} from './download-manager';

class FakeItem extends EventEmitter implements DownloadItemLike {
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted' =
    'progressing';
  received = 0;
  savePath = '';
  paused = false;
  resumable = false;
  calls: string[] = [];

  constructor(
    readonly url = 'https://files.example/report.pdf',
    readonly filename = 'report.pdf',
    readonly total = 1000,
  ) {
    super();
  }

  getURL() {
    return this.url;
  }
  getFilename() {
    return this.filename;
  }
  getSavePath() {
    return this.savePath;
  }
  setSavePath(path: string) {
    this.savePath = path;
  }
  getState() {
    return this.state;
  }
  getReceivedBytes() {
    return this.received;
  }
  getTotalBytes() {
    return this.total;
  }
  isPaused() {
    return this.paused;
  }
  canResume() {
    return this.resumable;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.calls.push('resume');
    this.paused = false;
    this.state = 'progressing';
  }
  cancel() {
    this.calls.push('cancel');
    this.state = 'cancelled';
    this.emit('done');
  }
  progress(received: number) {
    this.received = received;
    this.emit('updated');
  }
  finish(state: 'completed' | 'interrupted' = 'completed') {
    this.state = state;
    this.emit('done');
  }
}

function setup(
  overrides: Partial<DownloadManagerOptions> = {},
  saved: DownloadSummary[] = [],
) {
  const files = new Set<string>(['/dl/report.pdf']);
  const stored = new Map(saved.map((download) => [download.id, download]));
  let next = 0;
  const options: DownloadManagerOptions = {
    store: {
      loadDownloads: () => [...stored.values()],
      saveDownload: (download) => void stored.set(download.id, download),
      deleteDownload: (id) => void stored.delete(id),
    },
    downloadsFolder: () => '/dl',
    askWhereToSave: () => false,
    exists: (path) => files.has(path),
    restart: vi.fn(),
    openFile: vi.fn(async () => undefined),
    showFile: vi.fn(),
    confirmOpenRunnable: vi.fn(async () => false),
    createId: () => `d${++next}`,
    now: () => 100 + next,
    ...overrides,
  };
  const manager = new DownloadManager(options);
  return { manager, options, files, stored };
}

describe('DownloadManager', () => {
  it('saves into the downloads folder without overwriting', () => {
    const { manager } = setup();
    const item = new FakeItem();
    manager.track(item, 'page-1');
    expect(item.savePath).toBe('/dl/report 2.pdf');
    expect(manager.list()[0]).toMatchObject({
      pageId: 'page-1',
      state: 'progressing',
      filename: 'report.pdf',
    });
  });

  it('leaves the location to the user when asked to', () => {
    const { manager } = setup({ askWhereToSave: () => true });
    const item = new FakeItem();
    manager.track(item, null);
    expect(item.savePath).toBe('');
  });

  it('follows progress through to completion', () => {
    const { manager, stored } = setup();
    const item = new FakeItem();
    const id = manager.track(item, 'page-1');
    const changed = vi.fn();
    manager.onChange(changed);
    item.progress(400);
    expect(manager.list()[0]?.receivedBytes).toBe(400);
    expect(manager.activeCount).toBe(1);
    item.received = 1000;
    item.finish();
    expect(manager.list()[0]?.state).toBe('completed');
    expect(stored.get(id)?.state).toBe('completed');
    expect(changed).toHaveBeenCalled();
  });

  it('explains interruptions and retries them', async () => {
    const { manager, options } = setup();
    const resumable = new FakeItem();
    resumable.resumable = true;
    const first = manager.track(resumable, null);
    resumable.finish('interrupted');
    expect(manager.list()[0]?.problem).toMatch(/picks up where it stopped/);
    await manager.act(first, 'retry');
    expect(resumable.calls).toContain('resume');

    const fresh = new FakeItem('https://files.example/b.zip', 'b.zip');
    const second = manager.track(fresh, null);
    fresh.finish('interrupted');
    await manager.act(second, 'retry');
    expect(options.restart).toHaveBeenCalledWith('https://files.example/b.zip');
    expect(manager.list().some((d) => d.id === second)).toBe(false);
  });

  it('asks before opening a file that can run code', async () => {
    const { manager, options, files } = setup();
    const item = new FakeItem('https://x.example/Setup.pkg', 'Setup.pkg');
    const id = manager.track(item, null);
    item.finish();
    files.add(item.savePath);
    expect(manager.list()[0]?.runnable).toBe(true);
    await manager.act(id, 'open');
    expect(options.confirmOpenRunnable).toHaveBeenCalled();
    expect(options.openFile).not.toHaveBeenCalled();
  });

  it('notices when a finished file has been moved', async () => {
    const { manager, options } = setup();
    const item = new FakeItem();
    const id = manager.track(item, null);
    item.finish();
    await manager.act(id, 'show');
    expect(options.showFile).not.toHaveBeenCalled();
    expect(manager.list()[0]).toMatchObject({ state: 'missing' });
  });

  it('marks downloads cut off by quitting, and clears finished ones', () => {
    const saved: DownloadSummary[] = [
      {
        id: 'old',
        pageId: 'p',
        url: 'https://x.example/a',
        filename: 'a',
        savePath: '/dl/a',
        state: 'progressing',
        receivedBytes: 10,
        totalBytes: 100,
        startedAt: 1,
        problem: null,
        runnable: false,
      },
      {
        id: 'done',
        pageId: null,
        url: 'https://x.example/report.pdf',
        filename: 'report.pdf',
        savePath: '/dl/report.pdf',
        state: 'completed',
        receivedBytes: 100,
        totalBytes: 100,
        startedAt: 2,
        problem: null,
        runnable: false,
      },
    ];
    const { manager, stored } = setup({}, saved);
    expect(manager.list().find((d) => d.id === 'old')).toMatchObject({
      state: 'interrupted',
      problem: 'Splash quit before it finished.',
    });
    expect(stored.get('old')?.state).toBe('interrupted');
    manager.clearFinished();
    expect(manager.list()).toEqual([]);
    expect(stored.size).toBe(0);
  });
});
