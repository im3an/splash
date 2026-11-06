import type { PageId } from './types';

/** The part of a snapshot that says where pages sit in the sidebar. */
export interface TrailShape {
  rootIds: readonly PageId[];
  pages: Readonly<
    Record<
      PageId,
      {
        parentId: PageId | null;
        childIds: readonly PageId[];
        isPinned: boolean;
      }
    >
  >;
}

/**
 * What Close Pages Below closes: everything after this page in sidebar order,
 * its own children included. A pinned page stays, with the pages above it so
 * it keeps its place, and a pinned page has nothing below it: its stack sits
 * apart from the trail, so "below" would mean the whole trail.
 */
export function pagesBelow(
  { rootIds, pages }: TrailShape,
  id: PageId,
): PageId[] {
  if (!pages[id] || pages[id].isPinned) return [];
  const order: PageId[] = [];
  const visit = (ids: readonly PageId[]) => {
    for (const pageId of ids) {
      order.push(pageId);
      visit(pages[pageId]?.childIds ?? []);
    }
  };
  visit(rootIds);
  const keep = new Set(order.slice(0, order.indexOf(id) + 1));
  for (const pageId of order) {
    if (!pages[pageId]?.isPinned) continue;
    for (
      let at: PageId | null = pageId;
      at !== null && !keep.has(at);
      at = pages[at]?.parentId ?? null
    )
      keep.add(at);
  }
  return order.filter((pageId) => !keep.has(pageId));
}
