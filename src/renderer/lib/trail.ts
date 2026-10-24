import type { BrowserSnapshot, PageId } from '../../shared/types';

export interface TrailRow {
  id: PageId;
  depth: number;
  hasChildren: boolean;
}

/** The rows the sidebar shows, in order, skipping children of collapsed pages. */
export function visibleRows(snapshot: BrowserSnapshot): TrailRow[] {
  const rows: TrailRow[] = [];
  const visit = (ids: readonly PageId[], depth: number) => {
    for (const id of ids) {
      const page = snapshot.pages[id];
      if (!page) continue;
      rows.push({ id, depth, hasChildren: page.childIds.length > 0 });
      if (!page.collapsed) visit(page.childIds, depth + 1);
    }
  };
  visit(snapshot.rootIds, 0);
  return rows;
}
