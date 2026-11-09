import type { BrowserSnapshot, PageId } from '../../shared/types';
import { pageLabel } from './format';

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

/**
 * The trail narrowed to pages whose title or address has every typed word,
 * with the pages they came from so each keeps its place. Collapsed
 * branches open for the search.
 */
export function filteredRows(
  snapshot: BrowserSnapshot,
  query: string,
): TrailRow[] {
  if (!query.trim()) return visibleRows(snapshot);
  const matches = (id: PageId) => pageMatches(snapshot, id, query);
  const rows: TrailRow[] = [];
  // Returns whether the branch had a match, adding its rows if so.
  const visit = (id: PageId, parentId: PageId | null, depth: number) => {
    const page = snapshot.pages[id];
    if (!page) return false;
    const row: TrailRow = {
      id,
      parentId,
      depth,
      hasChildren: page.childIds.length > 0,
    };
    const at = rows.length;
    rows.push(row);
    let found = false;
    for (const childId of page.childIds) {
      if (visit(childId, id, depth + 1)) found = true;
    }
    if (found || matches(id)) return true;
    rows.length = at;
    return false;
  };
  for (const id of snapshot.rootIds) visit(id, null, 0);
  return rows;
}

export type MoveDirection = 'up' | 'down' | 'in' | 'out';

/**
 * Where ⌥⌘ and an arrow moves a page: past its sibling above or below,
 * into the sibling above as its last child, or out to just after its
 * parent. Pinned and unpinned pages stay in their own sections. `null`
 * when it can't go that way.
 */
export function keyboardMove(
  snapshot: BrowserSnapshot,
  id: PageId,
  direction: MoveDirection,
): { parentId: PageId | null; afterId: PageId | null } | null {
  const page = snapshot.pages[id];
  if (!page) return null;
  const { parentId } = page;
  const siblings = (
    parentId === null
      ? snapshot.rootIds
      : (snapshot.pages[parentId]?.childIds ?? [])
  ).filter(
    (sibling) =>
      parentId !== null || snapshot.pages[sibling]?.isPinned === page.isPinned,
  );
  const index = siblings.indexOf(id);
  switch (direction) {
    case 'up':
      if (index <= 0) return null;
      return { parentId, afterId: siblings[index - 2] ?? beforeSection() };
    case 'down':
      if (index < 0 || index === siblings.length - 1) return null;
      return { parentId, afterId: siblings[index + 1]! };
    case 'in': {
      const into = siblings[index - 1];
      if (into === undefined) return null;
      return {
        parentId: into,
        afterId: snapshot.pages[into]?.childIds.at(-1) ?? null,
      };
    }
    case 'out': {
      if (parentId === null) return null;
      return {
        parentId: snapshot.pages[parentId]?.parentId ?? null,
        afterId: parentId,
      };
    }
  }

  // The first unpinned root goes after the last pinned one, not first.
  function beforeSection(): PageId | null {
    if (parentId !== null || page!.isPinned) return null;
    return (
      snapshot.rootIds
        .filter((root) => snapshot.pages[root]?.isPinned)
        .at(-1) ?? null
    );
  }
}

/** The page's title or address has every word of `query`. */
export function pageMatches(
  snapshot: BrowserSnapshot,
  id: PageId,
  query: string,
): boolean {
  const page = snapshot.pages[id];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!page || words.length === 0) return false;
  const text = `${pageLabel(page)} ${page.url ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
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

/** Where a row's branch line is on the way to the current page. */
export interface PathGuide {
  /** The guide's level: the depth of the ancestor it hangs from. */
  level: number;
  /** The row the path turns into; its line stops at the row's middle. */
  end: boolean;
  /** How far down the path the row's line starts, in rows. */
  start: number;
}

/**
 * Lights the branch lines that lead from each ancestor down to the current
 * page, so its place in a deep trail reads at a glance. Rows are depth
 * first, so the rows between an ancestor and its child on the path all hang
 * from that ancestor, and each row lights at most one level.
 */
export function pathGuides(
  rows: readonly TrailRow[],
  activeId: PageId | null,
): Map<PageId, PathGuide> {
  const guides = new Map<PageId, PathGuide>();
  const index = new Map(rows.map((row, i) => [row.id, i]));
  if (activeId === null || !index.has(activeId)) return guides;
  // The path from the top of the trail down to the current page.
  const path: TrailRow[] = [];
  for (let id: PageId | null = activeId; id !== null; ) {
    const row: TrailRow | undefined = rows[index.get(id) ?? -1];
    if (!row) return guides;
    path.unshift(row);
    id = row.parentId;
  }
  let start = 0;
  for (let level = 0; level < path.length - 1; level++) {
    const from = index.get(path[level]!.id)!;
    const to = index.get(path[level + 1]!.id)!;
    for (let i = from + 1; i <= to; i++) {
      const end = i === to;
      guides.set(rows[i]!.id, { level, end, start });
      start += end ? 0.5 : 1;
    }
  }
  return guides;
}

/** Half a row of lit line: each row's line is a top and a bottom half. */
export interface GuideHalf {
  key: string;
  rowId: PageId;
  level: number;
  half: 'top' | 'bottom';
  /** How far down the path it starts, in rows. */
  start: number;
}

/**
 * Splits the lit lines into halves, so a row that stops being the path's
 * turn keeps its top half and only grows the rest.
 */
export function guideHalves(
  guides: ReadonlyMap<PageId, PathGuide>,
): GuideHalf[] {
  const halves: GuideHalf[] = [];
  for (const [rowId, { level, start, end }] of guides) {
    const key = `${rowId}:${level}`;
    halves.push({ key: `${key}:top`, rowId, level, half: 'top', start });
    if (!end) {
      halves.push({
        key: `${key}:bottom`,
        rowId,
        level,
        half: 'bottom',
        start: start + 0.5,
      });
    }
  }
  return halves;
}

/**
 * One half's share of a stroke drawing in or retracting: it moves between
 * `from` and `to` of the stroke's eased progress, so every half follows one
 * curve and the line moves as a single smooth stroke. `count` halves share
 * the stroke, which sets its length.
 */
export interface GuideStroke {
  direction: 'in' | 'out';
  from: number;
  to: number;
  count: number;
}

export interface DrawnHalf extends GuideHalf {
  /** Stable while drawn; a half that comes back gets a new one. */
  id: number;
  /** `null` once it's simply there. */
  stroke: GuideStroke | null;
  /** The plan in which it began retracting, until it's gone. */
  leavingSince: number | null;
}

let nextHalfId = 0;
let nextPlan = 0;

/**
 * Plans the lines when the current page changes. Halves already drawn keep
 * their entry, so updates mid-stroke never restart them. New halves draw
 * downward as one stroke from the first of them; halves no longer on the
 * path retract upward, the lowest first, at the same time. Without
 * `animate` (the trail's first paint) changes simply happen.
 */
export function planGuides(
  previous: ReadonlyMap<string, DrawnHalf>,
  halves: readonly GuideHalf[],
  animate: boolean,
): Map<string, DrawnHalf> {
  const plan = new Map<string, DrawnHalf>();
  const serial = ++nextPlan;
  const fresh = halves
    .filter((half) => {
      const drawn = previous.get(half.key);
      return !drawn || drawn.leavingSince !== null;
    })
    .sort((a, b) => a.start - b.start);
  const current = new Set(halves.map((half) => half.key));
  const leaving = [...previous.values()]
    .filter((drawn) => !current.has(drawn.key) && drawn.leavingSince === null)
    .sort((a, b) => b.start - a.start);

  for (const drawn of previous.values()) {
    if (current.has(drawn.key) && drawn.leavingSince === null) {
      plan.set(drawn.key, drawn);
    } else if (!current.has(drawn.key) && drawn.leavingSince !== null) {
      plan.set(drawn.key, drawn);
    }
  }
  fresh.forEach((half, rank) => {
    plan.set(half.key, {
      ...half,
      id: ++nextHalfId,
      leavingSince: null,
      stroke: animate ? stroke('in', rank, fresh.length) : null,
    });
  });
  if (animate) {
    leaving.forEach((drawn, rank) => {
      plan.set(drawn.key, {
        ...drawn,
        leavingSince: serial,
        stroke: stroke('out', rank, leaving.length),
      });
    });
  }
  return plan;
}

function stroke(
  direction: GuideStroke['direction'],
  rank: number,
  count: number,
): GuideStroke {
  return { direction, from: rank / count, to: (rank + 1) / count, count };
}

/** Drops halves that finished retracting in plans up to `serial`. */
export function pruneGuides(
  plan: ReadonlyMap<string, DrawnHalf>,
  serial: number,
): Map<string, DrawnHalf> {
  return new Map(
    [...plan].filter(
      ([, drawn]) => drawn.leavingSince === null || drawn.leavingSince > serial,
    ),
  );
}

export type TreeKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End';

/**
 * Where a key moves focus in the trail, following the WAI-ARIA tree
 * pattern: ↑ ↓ step through visible rows, ← goes to the parent and → to
 * the first child (collapsing and expanding happen before these, in the
 * row), Home and End jump to the ends. `null` when focus stays.
 */
export function treeFocusTarget(
  rows: readonly TrailRow[],
  id: PageId,
  key: TreeKey,
): PageId | null {
  const i = rows.findIndex((row) => row.id === id);
  if (i === -1) return rows[0]?.id ?? null;
  const row = rows[i]!;
  switch (key) {
    case 'ArrowUp':
      return rows[i - 1]?.id ?? null;
    case 'ArrowDown':
      return rows[i + 1]?.id ?? null;
    case 'ArrowLeft':
      return row.parentId;
    case 'ArrowRight': {
      const next = rows[i + 1];
      return next?.parentId === id ? next.id : null;
    }
    case 'Home':
      return i === 0 ? null : rows[0]!.id;
    case 'End':
      return i === rows.length - 1 ? null : rows.at(-1)!.id;
  }
}

/** Count complete branches, including pages hidden by collapsed ancestors. */
export function trailSectionCounts(snapshot: BrowserSnapshot) {
  const counts = { pinned: 0, open: 0 };
  const seen = new Set<PageId>();
  const visit = (id: PageId, section: keyof typeof counts) => {
    const page = snapshot.pages[id];
    if (!page || seen.has(id)) return;
    seen.add(id);
    counts[section]++;
    page.childIds.forEach((child) => visit(child, section));
  };
  snapshot.rootIds.forEach((id) =>
    visit(id, snapshot.pages[id]?.isPinned ? 'pinned' : 'open'),
  );
  return counts;
}

/** How long ago, in words a person would use. */
export function sinceLabel(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'An hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
