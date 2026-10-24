import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import type { BrowserSnapshot, PageId, PageSnapshot } from '../../shared/types';

interface ShellState {
  /** `null` until the main process has sent the first snapshot. */
  snapshot: BrowserSnapshot | null;
  sidebarOpen: boolean;
  /** Incremented to ask the address bar to take focus. */
  addressFocusRequest: number;
  /** The sidebar row currently being renamed in place. */
  renamingPageId: PageId | null;
  /** The page whose note is open for editing. */
  editingNotePageId: PageId | null;
  renamingWorkspace: boolean;
  receiveSnapshot(snapshot: BrowserSnapshot): void;
  toggleSidebar(): void;
  focusAddressBar(): void;
  startRename(pageId: PageId): void;
  finishRename(): void;
  editNote(pageId: PageId | null): void;
  setRenamingWorkspace(renaming: boolean): void;
}

export const useShell = create<ShellState>()((set) => ({
  snapshot: null,
  sidebarOpen: true,
  addressFocusRequest: 0,
  renamingPageId: null,
  editingNotePageId: null,
  renamingWorkspace: false,
  receiveSnapshot: (snapshot) => set({ snapshot }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  focusAddressBar: () =>
    set((state) => ({ addressFocusRequest: state.addressFocusRequest + 1 })),
  startRename: (pageId) => set({ renamingPageId: pageId, sidebarOpen: true }),
  finishRename: () => set({ renamingPageId: null }),
  editNote: (pageId) =>
    set({
      editingNotePageId: pageId,
      ...(pageId ? { sidebarOpen: true } : {}),
    }),
  setRenamingWorkspace: (renaming) =>
    set({
      renamingWorkspace: renaming,
      ...(renaming ? { sidebarOpen: true } : {}),
    }),
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
    const shell = useShell.getState();
    if (command.type === 'focus-address-bar') shell.focusAddressBar();
    else if (command.type === 'toggle-sidebar') shell.toggleSidebar();
    else if (command.type === 'rename-page') shell.startRename(command.pageId);
    else if (command.type === 'edit-note') shell.editNote(command.pageId);
    else if (command.type === 'rename-workspace')
      shell.setRenamingWorkspace(true);
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
