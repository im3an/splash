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

/** Where a page goes: under `parentId`, before `beforeId` or last. */
export interface MoveTarget {
  parentId: PageId | null;
  beforeId: PageId | null;
}

export type MoveDirection = 'up' | 'down' | 'indent' | 'outdent';

function siblingsOf(
  snapshot: BrowserSnapshot,
  parentId: PageId | null,
): readonly PageId[] {
  if (parentId === null) return snapshot.rootIds;
  return snapshot.pages[parentId]?.childIds ?? [];
}

export function isDescendant(
  snapshot: BrowserSnapshot,
  id: PageId,
  ancestorId: PageId,
): boolean {
  let parentId = snapshot.pages[id]?.parentId ?? null;
  while (parentId !== null) {
    if (parentId === ancestorId) return true;
    parentId = snapshot.pages[parentId]?.parentId ?? null;
  }
  return false;
}

/** The page's position after a keyboard move, or `null` when it can't move that way. */
export function moveTarget(
  snapshot: BrowserSnapshot,
  id: PageId,
  direction: MoveDirection,
): MoveTarget | null {
  const page = snapshot.pages[id];
  if (!page) return null;
  const siblings = siblingsOf(snapshot, page.parentId);
  const index = siblings.indexOf(id);
  const previous = siblings[index - 1];

  switch (direction) {
    case 'up':
      return previous === undefined
        ? null
        : { parentId: page.parentId, beforeId: previous };
    case 'down':
      return index === siblings.length - 1
        ? null
        : { parentId: page.parentId, beforeId: siblings[index + 2] ?? null };
    case 'indent':
      return previous === undefined
        ? null
        : { parentId: previous, beforeId: null };
    case 'outdent': {
      if (page.parentId === null) return null;
      const parent = snapshot.pages[page.parentId];
      if (!parent) return null;
      const uncles = siblingsOf(snapshot, parent.parentId);
      return {
        parentId: parent.parentId,
        beforeId: uncles[uncles.indexOf(parent.id) + 1] ?? null,
      };
    }
  }
}

export type DropPosition = 'before' | 'after' | 'inside';

/** Whether `dragId` may be dropped onto `targetId` (never into itself). */
export function canDropOn(
  snapshot: BrowserSnapshot,
  dragId: PageId,
  targetId: PageId,
): boolean {
  return dragId !== targetId && !isDescendant(snapshot, targetId, dragId);
}

/**
 * Turns a drop onto a row (or onto the empty space below the tree, when
 * `targetId` is `null`) into a move. Returns `null` when the drop would
 * leave the page where it already is.
 */
export function dropTarget(
  snapshot: BrowserSnapshot,
  dragId: PageId,
  targetId: PageId | null,
  position: DropPosition,
): MoveTarget | null {
  const drag = snapshot.pages[dragId];
  if (!drag) return null;
  const without = (ids: readonly PageId[]) => ids.filter((id) => id !== dragId);

  let target: MoveTarget;
  if (targetId === null) {
    target = { parentId: null, beforeId: null };
  } else {
    const page = snapshot.pages[targetId];
    if (!page || !canDropOn(snapshot, dragId, targetId)) return null;
    if (position === 'inside') {
      target = { parentId: targetId, beforeId: null };
    } else if (position === 'before') {
      target = { parentId: page.parentId, beforeId: targetId };
    } else if (page.childIds.length > 0 && !page.collapsed) {
      // Just below an expanded page reads as "first child", not "next sibling".
      target = {
        parentId: targetId,
        beforeId: without(page.childIds)[0] ?? null,
      };
    } else {
      const siblings = without(siblingsOf(snapshot, page.parentId));
      target = {
        parentId: page.parentId,
        beforeId: siblings[siblings.indexOf(targetId) + 1] ?? null,
      };
    }
  }

  const current = without(siblingsOf(snapshot, drag.parentId));
  const originalIndex = siblingsOf(snapshot, drag.parentId).indexOf(dragId);
  const currentNext = current[originalIndex] ?? null;
  const unchanged =
    target.parentId === drag.parentId && target.beforeId === currentNext;
  return unchanged ? null : target;
}
