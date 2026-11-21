import { useEffect } from 'react';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectBarless, useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';

/**
 * With the address bar in the sidebar and the sidebar shut, the sidebar comes
 * out over the page when the pointer reaches the window's left edge, like
 * Arc's. The page underneath is frozen meanwhile, as under any overlay, since
 * a live page view paints over the shell.
 */
export function startSidebarPeek(): void {
  const shell = useShell.getState();
  if (!selectBarless(shell) || shell.sidebarPeek) return;
  // Something else is over the page; the edge waits for it to go.
  if (useOverlay.getState().overlay) return;
  shell.setSidebarPeek(true);
  void useOverlay
    .getState()
    .open({ kind: 'sidebar-peek' })
    .catch(() => useShell.getState().setSidebarPeek(false));
}

/** Puts the peeking sidebar away, unless a menu opened from it is still up. */
export function endSidebarPeek(): void {
  const shell = useShell.getState();
  if (!shell.sidebarPeek) return;
  const overlay = useOverlay.getState();
  if (overlay.overlay && overlay.overlay.kind !== 'sidebar-peek') return;
  shell.setSidebarPeek(false);
  // Also cancels an open still on its way.
  overlay.close();
}

/** The peek came out for a toast, not the pointer, and goes with it. */
let forToast = false;

/** Keeps the peek, the overlay under it and the window buttons in step. */
export function useSidebarPeek(): void {
  const barless = useShell(selectBarless);
  const peek = useShell((state) => state.sidebarPeek);
  const showButtons = !barless || peek;
  useEffect(() => {
    api().setWindowButtonsVisible?.(showButtons);
  }, [showButtons]);

  useEffect(() => {
    // The overlay closing (a menu opened from the peek, Escape) ends it. Only
    // a close counts: the last overlay letting go of its still a moment after
    // it went isn't one, and may land while the peek is still opening.
    const offOverlay = useOverlay.subscribe((state, previous) => {
      if (!useShell.getState().sidebarPeek) return;
      const wasUp = previous.overlay !== null && !previous.leaving;
      if (wasUp && (!state.overlay || state.leaving)) {
        useShell.getState().setSidebarPeek(false);
        forToast = false;
      }
    });
    // Opened for real (⌘S, a panel) or the address bar moved to the toolbar.
    const offShell = useShell.subscribe((state) => {
      if (selectBarless(state)) return;
      if (state.sidebarPeek) state.setSidebarPeek(false);
      if (useOverlay.getState().overlay?.kind === 'sidebar-peek')
        useOverlay.getState().close();
    });
    // With nothing above the page, a toast (Closed … Undo) brings the sidebar
    // out to show it in the sidebar's top row, and takes it back after,
    // unless the pointer has come onto it meanwhile.
    const offToast = useToast.subscribe((state, previous) => {
      if (state.toast && state.toast.id !== previous.toast?.id) {
        if (useShell.getState().sidebarPeek) return;
        startSidebarPeek();
        forToast = useShell.getState().sidebarPeek;
      } else if (!state.toast && forToast) {
        forToast = false;
        if (!document.querySelector('aside.sidebar-peek:hover'))
          endSidebarPeek();
      }
    });
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        useOverlay.getState().overlay?.kind === 'sidebar-peek'
      )
        endSidebarPeek();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offOverlay();
      offShell();
      offToast();
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
