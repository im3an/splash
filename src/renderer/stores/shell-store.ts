import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import type { BrowserSnapshot, PageSnapshot } from '../../shared/types';

interface ShellState {
  /** `null` until the main process has sent the first snapshot. */
  snapshot: BrowserSnapshot | null;
  sidebarOpen: boolean;
  /** Incremented to ask the address bar to take focus. */
  addressFocusRequest: number;
  receiveSnapshot(snapshot: BrowserSnapshot): void;
  toggleSidebar(): void;
  focusAddressBar(): void;
}

export const useShell = create<ShellState>()((set) => ({
  snapshot: null,
  sidebarOpen: true,
  addressFocusRequest: 0,
  receiveSnapshot: (snapshot) => set({ snapshot }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  focusAddressBar: () =>
    set((state) => ({ addressFocusRequest: state.addressFocusRequest + 1 })),
}));

export function selectActivePage(state: ShellState): PageSnapshot | null {
  const id = state.snapshot?.activePageId;
  return (id && state.snapshot?.pages[id]) || null;
}

/** Feeds main-process state and commands into the store. */
export function connectShell(splash: SplashApi): () => void {
  const store = useShell.getState();
  const unsubscribeSnapshot = splash.onSnapshot(store.receiveSnapshot);
  const unsubscribeCommands = splash.onUiCommand((command) => {
    if (command === 'focus-address-bar') useShell.getState().focusAddressBar();
    if (command === 'toggle-sidebar') useShell.getState().toggleSidebar();
  });
  // Subscribe first so no update is missed; a pushed snapshot is never older
  // than the one we asked for, so it wins if it arrives first.
  void splash.getSnapshot().then((snapshot) => {
    if (useShell.getState().snapshot === null) store.receiveSnapshot(snapshot);
  });
  return () => {
    unsubscribeSnapshot();
    unsubscribeCommands();
  };
}
