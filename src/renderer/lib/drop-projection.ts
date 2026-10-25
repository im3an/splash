import type { PageId } from '../../shared/types';
import type { TrailRow } from './trail';

export interface DropProjection {
  depth: number;
  parentId: PageId | null;
  /** The sibling to land after; `null` lands first among the children. */
  afterId: PageId | null;
}

/** Rows without the dragged page's descendants, which travel with it. */
export function rowsWhileDragging(
  rows: TrailRow[],
  activeId: PageId,
): TrailRow[] {
  const start = rows.findIndex((row) => row.id === activeId);
  if (start === -1) return rows;
  const depth = rows[start]!.depth;
  let end = start + 1;
  while (end < rows.length && rows[end]!.depth > depth) end++;
  return [...rows.slice(0, start + 1), ...rows.slice(end)];
}

/**
 * Where a dragged page would land: the row it is over decides the vertical
 * slot, and the horizontal drag offset nudges it deeper or shallower within
 * what the neighbouring rows allow.
 */
export function projectDrop(
  rows: TrailRow[],
  activeId: PageId,
  overId: PageId,
  offsetX: number,
  indent: number,
): DropProjection | null {
  const items = rowsWhileDragging(rows, activeId);
  const activeIndex = items.findIndex((row) => row.id === activeId);
  const overIndex = items.findIndex((row) => row.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;

  const moved = [...items];
  const [active] = moved.splice(activeIndex, 1);
  moved.splice(overIndex, 0, active!);

  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const projected = active!.depth + Math.round(offsetX / indent);
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, projected));

  let parentId: PageId | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentId = previous.parentId;
    else if (depth > previous.depth) parentId = previous.id;
    else {
      const above = moved
        .slice(0, overIndex)
        .reverse()
        .find((row) => row.depth === depth);
      parentId = above?.parentId ?? null;
    }
  }

  let afterId: PageId | null = null;
  for (let index = overIndex - 1; index >= 0; index--) {
    const row = moved[index]!;
    if (row.depth < depth) break;
    if (row.depth === depth && row.parentId === parentId) {
      afterId = row.id;
      break;
    }
  }

  return { depth, parentId, afterId };
}
