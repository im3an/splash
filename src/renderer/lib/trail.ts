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
