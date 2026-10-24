import { create } from 'zustand';
import type { BrowserSnapshot, PageSnapshot } from '../../shared/types';

/** A mirror of the browser's state, as last reported by the backend. */
interface ShellState {
  /** `null` until the backend has sent the first snapshot. */
  snapshot: BrowserSnapshot | null;
  receiveSnapshot(snapshot: BrowserSnapshot): void;
}

export const useShell = create<ShellState>()((set) => ({
  snapshot: null,
  receiveSnapshot: (snapshot) => set({ snapshot }),
}));

export function selectActivePage(state: ShellState): PageSnapshot | null {
  const id = state.snapshot?.activePageId;
  return (id && state.snapshot?.pages[id]) || null;
}

export function selectActiveWorkspace(state: ShellState) {
  const snapshot = state.snapshot;
  return (
    snapshot?.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ??
    null
  );
}
