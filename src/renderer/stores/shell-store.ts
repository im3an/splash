import { create } from 'zustand';
import type { SplashApi } from '../../shared/api';
import type { Preferences } from '../../shared/preferences';
import { closedToast, noticeToast } from '../lib/notices';
import { openLocation, useOverlay } from './overlay-store';
import { useToast } from './toast-store';
import type {
  BrowserSnapshot,
  PageId,
  PageSnapshot,
  SplitView,
  WorkspaceSummary,
} from '../../shared/types';

/** A view shown in the sidebar in place of the trail. */
export type SidebarPanel = 'downloads' | 'history';

interface ShellState {
  /** `null` until the main process has sent the first snapshot. */
  snapshot: BrowserSnapshot | null;
  preferences: Preferences | null;
  sidebarOpen: boolean;
  sidebarPanel: SidebarPanel | null;
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
  /** Shows a panel in place of the trail (opening the sidebar), or the trail. */
  setSidebarPanel(panel: SidebarPanel | null): void;
  /** Shows `panel`, or goes back to the trail when it's already showing. */
  toggleSidebarPanel(panel: SidebarPanel): void;
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
  preferences: null,
  sidebarOpen: true,
  sidebarPanel: null,
  addressFocusRequest: 0,
  renamingPageId: null,
  editingNotePageId: null,
  renamingWorkspace: false,
  findOpen: false,
  findRequest: { serial: 0, action: 'open' },
  receiveSnapshot: (snapshot) => set({ snapshot }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarPanel: (panel) =>
    set(
      panel
        ? { sidebarPanel: panel, sidebarOpen: true }
        : { sidebarPanel: null },
    ),
  toggleSidebarPanel: (panel) =>
    set((state) =>
      state.sidebarOpen && state.sidebarPanel === panel
        ? { sidebarPanel: null }
        : { sidebarPanel: panel, sidebarOpen: true },
    ),
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

const NO_WORKSPACES: readonly WorkspaceSummary[] = Object.freeze([]);

/**
 * All workspaces. Selectors must return the same value for the same state:
 * a fresh `[]` on every call makes React re-render forever.
 */
export function selectWorkspaces(
  state: ShellState,
): readonly WorkspaceSummary[] {
  return state.snapshot?.workspaces ?? NO_WORKSPACES;
}

export function selectActivePage(state: ShellState): PageSnapshot | null {
  const id = state.snapshot?.activePageId;
  return (id && state.snapshot?.pages[id]) || null;
}

/**
 * Nothing to browse yet: no page, or a new page without an address. The
 * shell then sets the toolbar aside and offers the palette in its place.
 */
export function selectBlank(state: ShellState): boolean {
  if (!state.snapshot || selectVisibleSplit(state)) return false;
  const page = selectActivePage(state);
  return !page || (page.url === null && !page.error && !page.isLoading);
}

/**
 * No page in the workspace has pages beneath it, so the trail needs no
 * chevron column and its rows sit closer to the edge.
 */
export function selectFlatTrail(state: ShellState): boolean {
  const snapshot = state.snapshot;
  if (!snapshot) return false;
  return snapshot.rootIds.every((id) => !snapshot.pages[id]?.childIds.length);
}

/**
 * The address field and page controls are at the top of the sidebar (the
 * Address bar setting), and the sidebar is open to hold them.
 */
export function selectAddressInSidebar(state: ShellState): boolean {
  return state.sidebarOpen && state.preferences?.addressBar === 'sidebar';
}

/** The split view, while it is on screen (its pages include the active one). */
export function selectVisibleSplit(state: ShellState): SplitView | null {
  const split = state.snapshot?.split ?? null;
  const activeId = state.snapshot?.activePageId;
  return split && (split.leftId === activeId || split.rightId === activeId)
    ? split
    : null;
}

/**
 * Offers undo for each close that happens while the shell is open, and
 * withdraws the offer once that close is undone some other way (⇧⌘T).
 */
function watchClosed(): () => void {
  let seenSerial: number | null = null;
  return useShell.subscribe((state) => {
    if (!state.snapshot) return;
    const closed = state.snapshot.lastClosed;
    const serial = closed?.serial ?? 0;
    const toasts = useToast.getState();
    const offered = toasts.toast?.closedSerial;
    if (offered !== undefined && offered !== serial) {
      toasts.dismiss(toasts.toast!.id);
    }
    if (seenSerial === null) {
      seenSerial = serial;
    } else if (closed && serial > seenSerial) {
      seenSerial = serial;
      toasts.show(closedToast(closed));
    }
  });
}

/** Feeds main-process state and commands into the store. */
export function connectShell(splash: SplashApi): () => void {
  const store = useShell.getState();
  const unsubscribeSnapshot = splash.onSnapshot(store.receiveSnapshot);
  const unsubscribeCommands = splash.onUiCommand((command) => {
    const shell = useShell.getState();
    const overlay = useOverlay.getState();
    switch (command.type) {
      case 'open-location':
        // A blank page has no toolbar; the palette stands in for it.
        if (selectBlank(shell)) return void openLocation();
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
        // ⌘K again closes it, like the menu item toggling.
        if (overlay.overlay?.kind === 'palette') return overlay.close();
        return void overlay.open({ kind: 'palette', scope: 'palette' });
      case 'site-info':
        return void overlay.open({ kind: 'site-info' });
      // ⌥⌘L and ⌘Y again go back to the trail.
      case 'show-downloads':
        return shell.toggleSidebarPanel('downloads');
      case 'show-history':
        return shell.toggleSidebarPanel('history');
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
  const unsubscribeNotices = splash.onNotice((notice) =>
    useToast.getState().show(noticeToast(notice)),
  );
  const unsubscribeClosed = watchClosed();
  const unsubscribePreferences = splash.onPreferences((preferences) =>
    useShell.setState({ preferences }),
  );
  void splash.getPreferences().then((preferences) => {
    if (useShell.getState().preferences === null) {
      useShell.setState({ preferences });
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
    unsubscribeNotices();
    unsubscribeClosed();
    unsubscribePreferences();
  };
}
