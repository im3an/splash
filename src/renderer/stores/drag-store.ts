import { create } from 'zustand';
import type { PageId } from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from './overlay-store';
import { selectVisibleSplit, useShell } from './shell-store';

/** Somewhere outside the trail a dragged page can be dropped. */
export type DropTarget =
  | { kind: 'favorites' }
  | { kind: 'folder'; id: string }
  | { kind: 'split'; side: 'left' | 'right' };

/** A drop target that files what's dropped, rather than showing it. */
export type BookmarkDrop = Extract<
  DropTarget,
  { kind: 'favorites' | 'folder' }
>;

interface PageDragState {
  /** The page being dragged out of the trail, if any. */
  pageId: PageId | null;
  /** Where it would land if dropped now; null is back in the trail. */
  target: DropTarget | null;
  start(pageId: PageId): void;
  /** Reads what's under the pointer; elements mark themselves with `data-drop`. */
  track(x: number, y: number): void;
  end(): void;
}

let frozen = false;

/**
 * A page dragged from the trail can leave the sidebar: onto Favorites, or
 * onto the page area to show it beside the current page. The live page views
 * paint above the shell, so they step aside for stills while a drag runs and
 * the drop zones can draw over them.
 */
export const usePageDrag = create<PageDragState>()((set, get) => ({
  pageId: null,
  target: null,
  start: (pageId) => {
    set({ pageId, target: null });
    // An overlay already froze the pages; it owns them.
    if (useOverlay.getState().overlay) return;
    frozen = true;
    void api()
      .freezePage()
      .then((stills) => {
        if (!frozen || get().pageId !== pageId) return;
        useOverlay.setState({ frozenPages: stills });
        requestAnimationFrame(() => {
          if (frozen && get().pageId === pageId) api().setOverlayActive(true);
        });
      });
  },
  track: (x, y) => {
    const target = dropTargetAt(x, y);
    if (!sameTarget(get().target, target)) set({ target });
  },
  end: () => {
    set({ pageId: null, target: null });
    if (!frozen) return;
    frozen = false;
    api().setOverlayActive(false);
    // The returning view covers the still before it goes.
    setTimeout(() => {
      if (!useOverlay.getState().overlay)
        useOverlay.setState({ frozenPages: null });
    }, 120);
  },
}));

/**
 * A link dragged in from a page or another app, a native drag that the shell
 * only hears about through drag events. It can only be filed, never shown.
 */
export const useLinkDrag = create<{
  active: boolean;
  target: BookmarkDrop | null;
}>()(() => ({ active: false, target: null }));

/** Whether anything that can be bookmarked is being dragged. */
export function useDragging() {
  const page = usePageDrag((state) => state.pageId !== null);
  const link = useLinkDrag((state) => state.active);
  return page || link;
}

/** Where the drag in progress would land, whatever is being dragged. */
export function useDropTarget(): DropTarget | null {
  const page = usePageDrag((state) => state.target);
  const link = useLinkDrag((state) => state.target);
  return page ?? link;
}

/**
 * The page a page dropped on `side` would be shown beside: the other side
 * of the split on screen (a swap, when it's the dragged page), or else the
 * current page. Null when the drop would change nothing.
 */
export function splitPartner(
  pageId: PageId,
  side: 'left' | 'right',
): PageId | null {
  const state = useShell.getState();
  const split = selectVisibleSplit(state);
  if (split) {
    const there = side === 'left' ? split.leftId : split.rightId;
    const opposite = side === 'left' ? split.rightId : split.leftId;
    if (pageId === there) return null;
    return pageId === opposite ? there : opposite;
  }
  const activeId = state.snapshot?.activePageId ?? null;
  return activeId && activeId !== pageId ? activeId : null;
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null) {
  if (a === null || b === null) return a === b;
  if (a.kind === 'split') return b.kind === 'split' && a.side === b.side;
  if (a.kind === 'folder') return b.kind === 'folder' && a.id === b.id;
  return a.kind === b.kind;
}

export function dropTargetAt(x: number, y: number): DropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const zone = element.closest<HTMLElement>('[data-drop]');
    if (!zone) continue;
    const drop = zone.dataset.drop;
    if (drop === 'favorites') return { kind: 'favorites' };
    if (drop?.startsWith('folder:'))
      return { kind: 'folder', id: drop.slice('folder:'.length) };
    if (drop === 'split-left') return { kind: 'split', side: 'left' };
    if (drop === 'split-right') return { kind: 'split', side: 'right' };
  }
  return null;
}
