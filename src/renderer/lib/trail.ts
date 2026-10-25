import type { BrowserSnapshot, PageId } from '../../shared/types';

export interface TrailRow {
  id: PageId;
  parentId: PageId | null;
  depth: number;
  hasChildren: boolean;
}

/** The rows the sidebar shows, in order, skipping children of collapsed pages. */
export function visibleRows(snapshot: BrowserSnapshot): TrailRow[] {
  const rows: TrailRow[] = [];
  const visit = (
    ids: readonly PageId[],
    parentId: PageId | null,
    depth: number,
  ) => {
    for (const id of ids) {
      const page = snapshot.pages[id];
      if (!page) continue;
      rows.push({ id, parentId, depth, hasChildren: page.childIds.length > 0 });
      if (!page.collapsed) visit(page.childIds, id, depth + 1);
    }
  };
  visit(snapshot.rootIds, null, 0);
  return rows;
}

/** What a collapsed branch hides, so its row can still show it. */
export interface HiddenSummary {
  /** Every page beneath the collapsed one. */
  ids: PageId[];
  /** Pages playing sound that isn't muted. */
  playing: PageId[];
  /** The first page that failed to load, crashed or hangs. */
  failedId: PageId | null;
}

/** `null` unless the page is collapsed over at least one child. */
export function hiddenSummary(
  snapshot: BrowserSnapshot,
  id: PageId,
): HiddenSummary | null {
  const root = snapshot.pages[id];
  if (!root?.collapsed || root.childIds.length === 0) return null;
  const summary: HiddenSummary = { ids: [], playing: [], failedId: null };
  const visit = (ids: readonly PageId[]) => {
    for (const childId of ids) {
      const page = snapshot.pages[childId];
      if (!page) continue;
      summary.ids.push(childId);
      if (page.isAudible && !page.isMuted) summary.playing.push(childId);
      if (summary.failedId === null && (page.error || page.isUnresponsive)) {
        summary.failedId = childId;
      }
      visit(page.childIds);
    }
  };
  visit(root.childIds);
  return summary;
}
