import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import { useOverlay } from './overlay-store';
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
  findOpen: boolean;
  /** Incremented to focus the find field or step through matches. */
  findRequest: { serial: number; action: 'open' | 'next' | 'previous' };
  receiveSnapshot(snapshot: BrowserSnapshot): void;
  toggleSidebar(): void;
  focusAddressBar(): void;
  startRename(pageId: PageId): void;
  finishRename(): void;
  editNote(pageId: PageId | null): void;
  setRenamingWorkspace(renaming: boolean): void;
  requestFind(action: 'open' | 'next' | 'previous'): void;
  closeFind(): void;
}

export const useShell = create<ShellState>()((set) => ({
  snapshot: null,
  sidebarOpen: true,
  addressFocusRequest: 0,
  renamingPageId: null,
  editingNotePageId: null,
  renamingWorkspace: false,
  findOpen: false,
  findRequest: { serial: 0, action: 'open' },
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
  requestFind: (action) =>
    set((state) => ({
      findOpen: true,
      findRequest: { serial: state.findRequest.serial + 1, action },
    })),
  closeFind: () => set({ findOpen: false }),
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
    const overlay = useOverlay.getState();
    switch (command.type) {
      case 'focus-address-bar':
        return shell.focusAddressBar();
      case 'toggle-sidebar':
        return shell.toggleSidebar();
      case 'rename-page':
        return shell.startRename(command.pageId);
      case 'edit-note':
        return shell.editNote(command.pageId);
      case 'rename-workspace':
        return shell.setRenamingWorkspace(true);
      case 'find':
        return shell.requestFind(command.action);
      case 'open-palette':
        return void overlay.open({ kind: 'palette' });
      case 'site-info':
        return void overlay.open({ kind: 'site-info' });
      case 'create-workspace':
        return void overlay.open({
          kind: 'workspace-editor',
          workspaceId: null,
        });
      case 'customize-workspace': {
        const workspaceId = shell.snapshot?.activeWorkspaceId;
        if (workspaceId) {
          void overlay.open({ kind: 'workspace-editor', workspaceId });
        }
        return;
      }
    }
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
