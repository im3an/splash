import type { PageId, PageSnapshot } from './types';

/** Where a top-level trail was left. */
export interface TrailSummary {
  rootId: PageId;
  /** The page in it used most recently. */
  leftId: PageId;
  pageCount: number;
  lastActiveAt: number;
  /** The page on screen is in this trail. */
  current: boolean;
}

interface TrailShape {
  rootIds: readonly PageId[];
  activePageId: PageId | null;
  pages: Record<
    PageId,
    Pick<
      PageSnapshot,
      'childIds' | 'url' | 'customTitle' | 'lastActiveAt' | 'emoji'
    >
  >;
}

/**
 * Each trail and the page it was left on, the most recently used first and the
 * one on screen ahead of those. A lone page with no address is no trail.
 */
export function trailSummaries(shape: TrailShape): TrailSummary[] {
  const summaries: TrailSummary[] = [];
  for (const rootId of shape.rootIds) {
    const root = shape.pages[rootId];
    if (!root) continue;
    if (!root.url && !root.customTitle && !root.childIds.length) continue;
    const summary: TrailSummary = {
      rootId,
      leftId: rootId,
      pageCount: 0,
      lastActiveAt: -Infinity,
      current: false,
    };
    const visit = (id: PageId) => {
      const page = shape.pages[id];
      if (!page) return;
      summary.pageCount++;
      if (id === shape.activePageId) summary.current = true;
      const at = page.lastActiveAt ?? 0;
      if (at > summary.lastActiveAt) {
        summary.lastActiveAt = at;
        summary.leftId = id;
      }
      page.childIds.forEach(visit);
    };
    visit(rootId);
    summaries.push(summary);
  }
  return summaries.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt,
  );
}
