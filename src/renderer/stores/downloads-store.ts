import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import type { DownloadSummary } from '../../shared/types';

interface DownloadsState {
  downloads: DownloadSummary[];
  /** Interruptions the user hasn't looked at in the downloads list yet. */
  unseenProblems: number;
  /** Files that have arrived since the user last looked. */
  unseenFinished: number;
  markSeen(): void;
}

export const useDownloads = create<DownloadsState>()((set) => ({
  downloads: [],
  unseenProblems: 0,
  unseenFinished: 0,
  markSeen: () => {
    set((state) =>
      state.unseenProblems === 0 && state.unseenFinished === 0
        ? state
        : { unseenProblems: 0, unseenFinished: 0 },
    );
  },
}));

function receive(downloads: DownloadSummary[], restored = false): void {
  const before = new Map(
    useDownloads.getState().downloads.map((d) => [d.id, d.state]),
  );
  const newProblems = downloads.filter(
    (d) => d.state === 'interrupted' && before.get(d.id) === 'progressing',
  ).length;
  // A small file can start and finish between two updates, so not "progressing".
  const newlyFinished = restored
    ? 0
    : downloads.filter(
        (d) => d.state === 'completed' && before.get(d.id) !== 'completed',
      ).length;
  useDownloads.setState((state) => ({
    downloads,
    unseenProblems:
      downloads.length === 0 ? 0 : state.unseenProblems + newProblems,
    // Nothing is left to see once the list is empty.
    unseenFinished:
      downloads.length === 0 ? 0 : state.unseenFinished + newlyFinished,
  }));
}

export function connectDownloads(
  splash: Pick<SplashApi, 'onDownloads' | 'listDownloads'>,
): () => void {
  let connected = true;
  let receivedUpdate = false;
  const unsubscribe = splash.onDownloads((downloads) => {
    if (!connected) return;
    receivedUpdate = true;
    receive(downloads);
  });
  void splash
    .listDownloads()
    .then((downloads) => {
      if (connected && !receivedUpdate) receive(downloads, true);
    })
    .catch((error: unknown) => console.warn('Could not load downloads', error));
  return () => {
    connected = false;
    unsubscribe();
  };
}
