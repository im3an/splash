import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import type { DownloadSummary } from '../../shared/types';

interface DownloadsState {
  downloads: DownloadSummary[];
  /** Interruptions the user hasn't looked at in the downloads list yet. */
  unseenProblems: number;
  markSeen(): void;
}

export const useDownloads = create<DownloadsState>()((set) => ({
  downloads: [],
  unseenProblems: 0,
  markSeen: () => set({ unseenProblems: 0 }),
}));

function receive(downloads: DownloadSummary[]): void {
  const before = new Map(
    useDownloads.getState().downloads.map((d) => [d.id, d.state]),
  );
  const newProblems = downloads.filter(
    (d) => d.state === 'interrupted' && before.get(d.id) === 'progressing',
  ).length;
  useDownloads.setState((state) => ({
    downloads,
    unseenProblems: state.unseenProblems + newProblems,
  }));
}

export function connectDownloads(splash: SplashApi): () => void {
  const unsubscribe = splash.onDownloads(receive);
  void splash.listDownloads().then(receive);
  return unsubscribe;
}
