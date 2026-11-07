import type { DownloadSummary } from '../../shared/types';
import { connectDownloads, useDownloads } from './downloads-store';

const download: DownloadSummary = {
  id: 'one',
  pageId: null,
  url: 'https://example.com/file',
  filename: 'file',
  savePath: '/dl/file',
  state: 'progressing',
  receivedBytes: 0,
  totalBytes: 100,
  bytesPerSecond: 0,
  startedAt: 0,
  problem: null,
  runnable: false,
};

beforeEach(() =>
  useDownloads.setState({
    downloads: [],
    unseenProblems: 0,
    unseenFinished: 0,
  }),
);

function connect() {
  let resolve!: (downloads: DownloadSummary[]) => void;
  let push!: (downloads: DownloadSummary[]) => void;
  const initial = new Promise<DownloadSummary[]>((done) => {
    resolve = done;
  });
  const unsubscribe = vi.fn();
  const stop = connectDownloads({
    onDownloads: (listener) => {
      push = listener;
      return unsubscribe;
    },
    listDownloads: () => initial,
  });
  return { resolve, push, stop, unsubscribe };
}

it('keeps a pushed update when an older initial response arrives later', async () => {
  const { resolve, push, stop } = connect();
  push([{ ...download, state: 'completed', receivedBytes: 100 }]);
  resolve([download]);
  await Promise.resolve();
  expect(useDownloads.getState().downloads[0]?.state).toBe('completed');
  stop();
});

it('ignores an initial response after disconnecting', async () => {
  const { resolve, stop, unsubscribe } = connect();
  stop();
  resolve([download]);
  await Promise.resolve();
  expect(useDownloads.getState().downloads).toEqual([]);
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('clears problem badges when the download list is emptied', () => {
  const { push, stop } = connect();
  push([download]);
  push([{ ...download, state: 'interrupted' }]);
  expect(useDownloads.getState().unseenProblems).toBe(1);
  push([]);
  expect(useDownloads.getState().unseenProblems).toBe(0);
  stop();
});
