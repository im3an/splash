import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  closestCenter,
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import {
  AppWindow,
  ChevronRight,
  CircleAlert,
  Columns2,
  Moon,
  MoreHorizontal,
  Pin,
  PencilLine,
  StickyNote,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BrowserSnapshot,
  PageGroup,
  PageId,
  PageSnapshot,
  WorkspaceId,
} from '../../shared/types';
import {
  projectDrop,
  rowsWhileDragging,
  type DropProjection,
} from '../lib/drop-projection';
import { useOverlay } from '../stores/overlay-store';
import { Highlighted } from './PaletteList';
import { TrailGroup } from './TrailGroup';
import { TrailIconPicker } from './GroupIconPicker';
import { pageLabel, pageParts } from '../lib/format';
import { shareById } from '../lib/share-unchanged';
import { renamedToast, trailMoveToast } from '../lib/notices';
import {
  trailSectionCounts,
  hiddenSummary,
  guideHalves,
  pathGuides,
  planGuides,
  pruneGuides,
  treeFocusTarget,
  filteredRows,
  keyboardMove,
  type MoveDirection,
  pageMatches,
  visibleRows,
  type DrawnHalf,
  type GuideStroke,
  type HiddenSummary,
  type TrailRow as Row,
  type TreeKey,
} from '../lib/trail';
import { durationMs, easing } from '../lib/motion';
import {
  CHEVRON_CENTER,
  FLAT_LEAD,
  INDENT,
  LEAD,
  MINIMAL_INDENT,
  rowBox,
  rowOffset,
} from '../lib/trail-rows';
import { api } from '../splash-api';
import {
  selectFlatTrail,
  selectMinimalTrail,
  selectVisibleSplit,
  selectWorkspaces,
  useShell,
} from '../stores/shell-store';
import { fileLink } from '../lib/bookmarks';
import { collectionNotice, webLink } from '../lib/collections';
import {
  splitPartner,
  useLinkDrag,
  usePageDrag,
  type DropTarget,
} from '../stores/drag-store';
import { useDownloads } from '../stores/downloads-store';
import { useToast } from '../stores/toast-store';
import {
  openPageMenu,
  usePageMenu,
  useTrailIcon,
} from '../stores/page-menu-store';
import { DownloadRing } from './DownloadRing';
import { Favicon } from './Favicon';
import { usePagePreview } from './PagePreview';
import { PageNote } from './PageNote';

type Section =
  | { key: string; kind: 'pinned' }
  | { key: string; kind: 'pages' }
  | { key: string; kind: 'group'; group: PageGroup };

/** Which part of the trail a top-level page shows in. */
function sectionOf(page: PageSnapshot | undefined): string {
  if (!page) return 'pages';
  return page.isPinned ? 'pinned' : (page.groupId ?? 'pages');
}

/** Pages in each group, counting the ones beneath its top-level pages. */
function groupBranchCounts(snapshot: BrowserSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  const size = (id: PageId): number =>
    1 +
    (snapshot.pages[id]?.childIds ?? []).reduce(
      (total, child) => total + size(child),
      0,
    );
  for (const id of snapshot.rootIds) {
    const groupId = snapshot.pages[id]?.groupId;
    if (groupId) counts[groupId] = (counts[groupId] ?? 0) + size(id);
  }
  return counts;
}

interface DragState {
  activeId: PageId;
  overId: PageId;
  offsetX: number;
}

export function TrailTree({ newPage }: { newPage?: ReactNode }) {
  const snapshot = useShell((state) => state.snapshot);
  const visibleSplit = useShell(selectVisibleSplit);
  const flat = useShell(selectFlatTrail);
  const minimal = useShell(selectMinimalTrail);
  const indent = minimal ? MINIMAL_INDENT : INDENT;
  // Rows that arrive after the first paint grow in; the first ones don't.
  const painted = useRef(false);
  useEffect(() => {
    painted.current = true;
  }, []);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Where the pointer is, for dropping a page on a workspace below the trail.
  const pointerAt = useRef({ x: 0, y: 0 });
  const workspaceDrop = useShell((state) => state.workspaceDropId);
  const setWorkspaceDrop = useShell((state) => state.setWorkspaceDrop);
  // Out of the trail, a drag follows the pointer to Favorites or the page.
  const dropTarget = usePageDrag((state) => state.target);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const track = (event: PointerEvent) => {
      pointerAt.current = { x: event.clientX, y: event.clientY };
      // Off the window's edge it stops being a move in the trail, and goes on
      // as macOS's own drag of the trail as a Markdown file.
      const pageId = usePageDrag.getState().pageId;
      if (pageId && leftWindow(event.clientX, event.clientY)) {
        void api().dragTrailOut({ pageId });
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }),
        );
        return;
      }
      usePageDrag.getState().track(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', track, true);
    return () => window.removeEventListener('pointermove', track, true);
  }, [dragging]);
  // A small threshold keeps plain clicks from turning into drags.
  // No dragging while filtered: neighbours on screen aren't neighbours.
  const pointer = useSensor(PointerSensor, POINTER_OPTIONS);

  const filter = useShell((state) => state.trailFilter)?.trim() ?? '';
  const filtering = filter !== '';
  const sensors = useSensors(filtering ? undefined : pointer);
  const keptRows = useRef<Row[]>([]);
  const allRows = useMemo(() => {
    const next = !snapshot
      ? []
      : filtering
        ? filteredRows(snapshot, filter)
        : visibleRows(snapshot);
    // Unchanged rows keep their object, so only rows that changed draw again.
    keptRows.current = shareById(keptRows.current, next);
    return keptRows.current;
  }, [snapshot, filter, filtering]);
  // Collapsed rows stand in for the pages beneath them.
  const hidden = useMemo(() => {
    const summaries = new Map<PageId, HiddenSummary>();
    // Filtering opens collapsed branches, so nothing is hidden.
    if (!snapshot || filtering) return summaries;
    for (const row of allRows) {
      const summary = hiddenSummary(snapshot, row.id);
      if (summary) summaries.set(row.id, summary);
    }
    return summaries;
  }, [snapshot, allRows, filtering]);
  const activeId = snapshot?.activePageId ?? null;
  const guides = useMemo(
    () => pathGuides(allRows, activeId),
    [allRows, activeId],
  );
  // Opening another page draws the new part of its path down the trail and
  // retracts the part it left. Not when the trail first shows: it's there.
  const drawn = useRef(new Map<string, DrawnHalf>());
  const hadRows = useRef(false);
  const [pruned, setPruned] = useState(0);
  const lines = useMemo(() => {
    const plan = planGuides(
      drawn.current,
      guideHalves(guides),
      hadRows.current && durationMs('--duration-base') > 0,
    );
    drawn.current = plan;
    hadRows.current = allRows.length > 0;
    const byRow = new Map<PageId, DrawnHalf[]>();
    for (const half of plan.values()) {
      byRow.set(half.rowId, [...(byRow.get(half.rowId) ?? []), half]);
    }
    return byRow;
    // `pruned` recomputes once retracted halves are dropped.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [guides, allRows.length, pruned]);
  // Retracted halves stay at nothing until they're dropped here.
  useEffect(() => {
    let serial = 0;
    for (const half of drawn.current.values()) {
      serial = Math.max(serial, half.leavingSince ?? 0);
    }
    if (serial === 0) return;
    const timer = setTimeout(
      () => {
        drawn.current = pruneGuides(drawn.current, serial);
        setPruned((count) => count + 1);
      },
      durationMs('--duration-exit') + 50,
    );
    return () => clearTimeout(timer);
  }, [lines]);
  // The row keyboard focus rests on; Tab comes back to it. Until the
  // arrows move it, that's the current page.
  const [focusedId, setFocusedId] = useState<PageId | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(allRows);
  rowsRef.current = allRows;
  const navigate = useCallback((id: PageId, key: TreeKey) => {
    const visible = rowsRef.current.filter((row) => {
      const item = treeRef.current?.querySelector<HTMLElement>(
        `[data-page-id="${CSS.escape(row.id)}"]`,
      );
      const section = item?.closest('details');
      return !section || section.open;
    });
    const target = treeFocusTarget(visible, id, key);
    if (!target) return;
    setFocusedId(target);
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(target)}"]`)
      ?.focus();
  }, []);
  const rows = drag ? rowsWhileDragging(allRows, drag.activeId) : allRows;
  // A new list here would draw every row: each one listens to this context.
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const projection: DropProjection | null = drag
    ? projectDrop(allRows, drag.activeId, drag.overId, drag.offsetX, indent)
    : null;

  if (snapshot === null) return <TrailSkeleton />;
  if (filtering && allRows.length === 0) return <FilterEmpty query={filter} />;
  if (allRows.length === 0)
    return (
      <>
        {newPage}
        <TrailEmpty />
      </>
    );

  const sectionCounts = trailSectionCounts(snapshot);
  const sections: Section[] = [
    { key: 'pinned', kind: 'pinned' },
    ...snapshot.groups.map(
      (group): Section => ({
        key: group.id,
        kind: 'group',
        group,
      }),
    ),
    { key: 'pages', kind: 'pages' },
  ];
  const groupCounts = new Map<string, number>();
  for (const [key, count] of Object.entries(groupBranchCounts(snapshot))) {
    groupCounts.set(key, count);
  }
  const split = snapshot.split;
  const tabStop =
    focusedId && allRows.some((row) => row.id === focusedId)
      ? focusedId
      : (activeId ?? allRows[0]!.id);
  const isInSplit = (id: PageId) =>
    split !== null && (split.leftId === id || split.rightId === id);

  // Screen readers hear page titles, not ids. The toast says where it went.
  const titleOf = (id: UniqueIdentifier) => {
    const page = snapshot.pages[String(id)];
    return page ? `“${pageLabel(page)}”` : 'The page';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${titleOf(active.id)} is over ${titleOf(over.id)}.`
        : undefined,
    onDragEnd: () => undefined,
    onDragCancel: ({ active }) => `${titleOf(active.id)} was put back.`,
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const id = String(active.id);
    if (activatorEvent instanceof PointerEvent) {
      pointerAt.current = {
        x: activatorEvent.clientX,
        y: activatorEvent.clientY,
      };
    }
    setDrag({ activeId: id, overId: id, offsetX: 0 });
    usePageDrag.getState().start(id);
  };
  const onDragMove = ({ active, over, delta }: DragMoveEvent) => {
    setDrag({
      activeId: String(active.id),
      overId: over ? String(over.id) : String(active.id),
      offsetX: delta.x,
    });
    setWorkspaceDrop(
      workspaceAt(pointerAt.current, snapshot.activeWorkspaceId),
    );
  };
  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    setDrag(null);
    setWorkspaceDrop(null);
    const outside = usePageDrag.getState().target;
    usePageDrag.getState().end();
    if (workspaceDrop) {
      void api().movePageToWorkspace(String(active.id), workspaceDrop);
      return;
    }
    if (outside) {
      dropOutside(String(active.id), outside);
      return;
    }
    if (!over) return;
    const target = projectDrop(
      allRows,
      String(active.id),
      String(over.id),
      delta.x,
      indent,
    );
    if (!target) return;
    const current = allRows.find((row) => row.id === active.id);
    const unchanged =
      current?.parentId === target.parentId &&
      target.afterId === previousSiblingId(allRows, String(active.id));
    if (!unchanged && current) {
      void moveWithUndo(
        current,
        previousSiblingId(allRows, current.id),
        target.parentId,
        target.afterId,
      );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Drag to move the page, or out of the window to save its trail as Markdown. With the keyboard, Option-Command and the arrow keys move it.',
        },
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDrag(null);
        setWorkspaceDrop(null);
        usePageDrag.getState().end();
      }}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div
          ref={treeRef}
          role="tree"
          aria-label="Pages"
          className="relative isolate flex flex-col gap-px"
          onBlur={(event) => {
            // Leaving the trail hands the tab stop back to the current page.
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setFocusedId(null);
            }
          }}
        >
          {sections.map((section) => {
            let inSection = false;
            const sectionRows = rows.filter((row) => {
              if (row.depth === 0)
                inSection = sectionOf(snapshot.pages[row.id]) === section.key;
              return inSection;
            });
            const pinned = section.kind === 'pinned';
            // With no pane around them, a folder's pages show they're inside
            // by sitting one step in. A row's real depth stays as it is.
            const nest = minimal && section.kind === 'group' ? 1 : 0;
            // New page leads the open pages, even when every page is pinned.
            if (
              !sectionRows.length &&
              section.kind !== 'group' &&
              (pinned || !newPage)
            )
              return null;
            const content = (
              <div className="sidebar-section-content flex flex-col gap-px">
                {section.kind === 'pages' && newPage}
                {sectionRows.map((row) => (
                  <Fragment key={row.id}>
                    <TrailRow
                      row={row}
                      depth={
                        nest +
                        (row.id === drag?.activeId &&
                        projection &&
                        !dropTarget &&
                        !workspaceDrop
                          ? projection.depth
                          : row.depth)
                      }
                      active={row.id === snapshot.activePageId}
                      tabStop={row.id === tabStop}
                      lines={drag ? NO_LINES : (lines.get(row.id) ?? NO_LINES)}
                      onNavigate={navigate}
                      onFocusRow={setFocusedId}
                      inSplit={isInSplit(row.id)}
                      paired={
                        visibleSplit !== null &&
                        row.id !== snapshot.activePageId &&
                        isInSplit(row.id)
                      }
                      dragging={row.id === drag?.activeId}
                      hidden={hidden.get(row.id) ?? null}
                      flat={flat}
                      minimal={minimal}
                      appear={painted.current}
                    />
                    {!drag && (
                      <PageNote
                        pageId={row.id}
                        depth={row.depth + nest}
                        indent={indent}
                        lead={flat ? FLAT_LEAD : LEAD}
                      />
                    )}
                  </Fragment>
                ))}
              </div>
            );
            if (section.kind === 'group') {
              return (
                <TrailGroup
                  key={section.key}
                  group={section.group}
                  count={groupCounts.get(section.key) ?? 0}
                >
                  {content}
                </TrailGroup>
              );
            }
            // One kind of page needs no heading over it.
            if (!sectionCounts.pinned)
              return <Fragment key={section.key}>{content}</Fragment>;
            return (
              <details key={section.key} className="trail-section" open>
                <summary className="sidebar-section-heading">
                  <span className="sidebar-section-label">
                    {pinned ? 'Pinned' : 'Pages'}
                    <ChevronRight size={12} />
                    <span className="sidebar-folded-count">
                      {pinned ? sectionCounts.pinned : sectionCounts.open}
                    </span>
                  </span>
                </summary>
                {content}
              </details>
            );
          })}
          <CurrentMarker
            treeRef={treeRef}
            activeId={snapshot.activePageId}
            dragging={drag !== null}
          />
          <TrailIcon />
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** At or past the window's edge: where a page drag turns into a file drag. */
function leftWindow(x: number, y: number): boolean {
  return (
    x <= 0 ||
    y <= 0 ||
    x >= window.innerWidth - 1 ||
    y >= window.innerHeight - 1
  );
}

/** Picks a trail's emoji, opening at its mark in the trail. */
function TrailIcon() {
  const pageId = useTrailIcon((state) => state.pageId);
  const anchor = pageId
    ? document.querySelector<HTMLElement>(
        `.trail-row[data-page-id="${CSS.escape(pageId)}"] .trail-favicon`,
      )
    : null;
  if (!pageId || !anchor) return null;
  return (
    <TrailIconPicker
      key={pageId}
      pageId={pageId}
      anchor={anchor}
      onClose={() => useTrailIcon.setState({ pageId: null })}
    />
  );
}

/** A page dropped outside the trail: onto Favorites or a side of the page. */
function dropOutside(pageId: PageId, target: DropTarget): void {
  const page = useShell.getState().snapshot?.pages[pageId];
  if (!page) return;
  if (target.kind === 'favorites' || target.kind === 'folder') {
    const link = webLink(page);
    if (!link) {
      collectionNotice('Only web pages can be bookmarked.');
      return;
    }
    void fileLink(
      { ...link, title: pageParts(page).title },
      target.kind === 'folder' ? target.id : null,
    );
    return;
  }
  const partner = splitPartner(pageId, target.side);
  if (partner) void api().openSplit(pageId, partner, target.side);
}

/**
 * The other workspace whose chip is under `point`, if any. The dragged row
 * itself may be under the pointer too, so every element there is checked.
 */
function workspaceAt(
  point: { x: number; y: number },
  currentId: WorkspaceId,
): WorkspaceId | null {
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const chip = element.closest<HTMLElement>('[data-workspace-id]');
    if (chip) {
      const id = chip.dataset.workspaceId ?? null;
      return id === currentId ? null : id;
    }
  }
  return null;
}

/**
 * Moves a dragged page and confirms where it went, with an undo that puts
 * it back between the same neighbours.
 */
async function moveWithUndo(
  row: Row,
  previousAfterId: PageId | null,
  parentId: PageId | null,
  afterId: PageId | null,
): Promise<void> {
  const splash = api();
  await splash.movePage(row.id, parentId, afterId);
  const pages = useShell.getState().snapshot?.pages;
  const page = pages?.[row.id];
  if (!page) return;
  const parent = parentId ? pages[parentId] : undefined;
  useToast.getState().show(
    trailMoveToast({
      label: pageParts(page).title,
      parentLabel: parent ? pageParts(parent).title : null,
      sameParent: row.parentId === parentId,
      // Either spot may be gone by then (a neighbour closed); then it stays,
      // and the toast says so.
      undo: () => splash.movePage(row.id, row.parentId, previousAfterId),
      redo: () => splash.movePage(row.id, parentId, afterId),
    }),
  );
}

/** The sibling directly above a row, at the same depth. */
const MOVE_KEYS: Record<string, MoveDirection | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowRight: 'in',
  ArrowLeft: 'out',
};

/** The sibling just above a page, from the whole trail, collapsed or not. */
function previousSiblingIdIn(
  snapshot: BrowserSnapshot,
  id: PageId,
): PageId | null {
  const parentId = snapshot.pages[id]?.parentId ?? null;
  const siblings =
    parentId === null
      ? snapshot.rootIds
      : (snapshot.pages[parentId]?.childIds ?? []);
  return siblings[siblings.indexOf(id) - 1] ?? null;
}

function previousSiblingId(rows: Row[], id: PageId): PageId | null {
  const index = rows.findIndex((row) => row.id === id);
  const row = rows[index];
  if (!row) return null;
  for (let i = index - 1; i >= 0; i--) {
    const candidate = rows[i]!;
    if (candidate.depth < row.depth) return null;
    if (candidate.depth === row.depth) return candidate.id;
  }
  return null;
}

/** Outside the component: a new object here would draw every row each time. */
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };

const TrailRow = memo(function TrailRow({
  row,
  depth,
  active,
  tabStop,
  lines,
  onNavigate,
  onFocusRow,
  inSplit,
  paired,
  dragging,
  hidden,
  flat,
  minimal,
  appear,
}: {
  row: Row;
  depth: number;
  active: boolean;
  /** The row Tab lands on in the trail. */
  tabStop: boolean;
  /** Its pieces of the line down to the current page, drawn or leaving. */
  lines: readonly DrawnHalf[];
  onNavigate(id: PageId, key: TreeKey): void;
  onFocusRow(id: PageId): void;
  /** One of the two pages of the workspace's split view. */
  inSplit: boolean;
  /** On screen beside the active page. */
  paired: boolean;
  dragging: boolean;
  hidden: HiddenSummary | null;
  /** No row has a chevron, so none keeps a column for one. */
  flat: boolean;
  /** The Minimal trail style: a chevron or dot, and rows edge to edge. */
  minimal: boolean;
  /** Animate in on mount: the row was just opened or revealed. */
  appear: boolean;
}) {
  const linkOver = useLinkDrag(
    (state) => state.opening?.kind === 'page' && state.opening.id === row.id,
  );
  const page = useShell((state) => state.snapshot?.pages[row.id]);
  const filter = useShell((state) => state.trailFilter)?.trim() ?? '';
  // While filtering, pages shown only for a match below them step back.
  const matched = useShell(
    (state) =>
      !filter ||
      (state.snapshot !== null && pageMatches(state.snapshot, row.id, filter)),
  );
  const renaming = useShell((state) => state.renamingPageId === row.id);
  const download = useDownloads((state) =>
    state.downloads.find(
      (d) => d.pageId === row.id && d.state === 'progressing',
    ),
  );
  const startRename = useShell((state) => state.startRename);
  const showSiteNames = useShell(
    (state) => state.preferences?.showSiteNames ?? true,
  );
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id, disabled: renaming });
  const rowRef = useRef<HTMLDivElement | null>(null);
  const preview = usePagePreview(
    rowRef,
    page ? pageLabel(page) : '',
    page?.url ?? null,
  );
  const [appearing, setAppearing] = useState(appear);

  // A page activated from elsewhere (the palette, a link, ⌘1–9) is
  // scrolled into view, so the trail always shows where you are.
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!page) return null;

  const expanded = row.hasChildren
    ? filter
      ? true
      : !page.collapsed
    : undefined;
  const label = pageLabel(page);
  const parts = pageParts(page);
  // The top of a trail with pages under it, or one that's been marked as one.
  const trailhead = row.depth === 0 && (row.hasChildren || Boolean(page.emoji));
  // One quiet marker at the row's end; close takes its place on hover.
  const marker = page.shownElsewhere ? (
    <AppWindow size={11} aria-label="Showing in another window" />
  ) : inSplit ? (
    <Columns2 size={11} aria-label="In split view" />
  ) : page.note ? (
    <StickyNote size={11} aria-label="Has a note" />
  ) : page.isDiscarded && !active ? (
    <Moon size={10} aria-label="Asleep" className="opacity-60" />
  ) : null;

  const menuOpen = usePageMenu((state) => state.menu?.pageId === row.id);
  const activate = () => void api().activatePage(row.id);
  const close = (event: MouseEvent) => {
    event.stopPropagation();
    void api().closePage(row.id);
  };
  const setCollapsed = (collapsed: boolean) =>
    void api().setCollapsed(row.id, collapsed);

  const onKeyDown = (event: KeyboardEvent) => {
    if (renaming) return;
    const key = event.key;
    // ⌥⌘ and an arrow moves the page itself, with an undo.
    const direction = MOVE_KEYS[key];
    if (event.metaKey && event.altKey && !event.ctrlKey && direction) {
      event.preventDefault();
      const snapshot = useShell.getState().snapshot;
      const target =
        snapshot && !filter ? keyboardMove(snapshot, row.id, direction) : null;
      if (target) {
        void moveWithUndo(
          row,
          previousSiblingIdIn(snapshot!, row.id),
          target.parentId,
          target.afterId,
        );
      }
      return;
    }
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      activate();
    } else if (key === 'ArrowLeft' && expanded) {
      event.preventDefault();
      setCollapsed(true);
    } else if (key === 'ArrowRight' && expanded === false) {
      event.preventDefault();
      setCollapsed(false);
    } else if (
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'Home' ||
      key === 'End'
    ) {
      event.preventDefault();
      onNavigate(row.id, key);
    } else if (key === 'F2') {
      event.preventDefault();
      startRename(row.id);
    }
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={active}
      aria-expanded={expanded}
      aria-label={[
        label,
        page.isPinned && 'pinned',
        hidden &&
          `${hidden.ids.length} hidden ${hidden.ids.length === 1 ? 'page' : 'pages'}`,
      ]
        .filter(Boolean)
        .join(', ')}
      aria-roledescription={trailhead ? 'trail' : 'page'}
      tabIndex={tabStop ? 0 : -1}
      data-page-id={row.id}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          onFocusRow(row.id);
          preview.show();
        }
      }}
      aria-describedby={preview.describedBy}
      onMouseEnter={preview.show}
      onMouseLeave={preview.hide}
      // After the spread listeners, so this must hand on to the drag's own.
      onPointerDown={(event) => {
        preview.hide();
        listeners?.onPointerDown?.(event);
      }}
      onBlur={preview.hide}
      onClick={activate}
      onAuxClick={(event) => event.button === 1 && close(event)}
      onContextMenu={(event) => {
        event.preventDefault();
        openPageMenu(row.id, event);
      }}
      onKeyDown={onKeyDown}
      data-active={active}
      data-flat={flat}
      // Minimal keeps every row alike; the pin at its end says enough.
      data-pinned-root={!minimal && page.isPinned && row.depth === 0}
      data-trailhead={trailhead}
      data-paired={paired}
      data-menu-open={menuOpen}
      data-dragging={dragging}
      data-link-over={linkOver}
      data-discarded={page.isDiscarded}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setAppearing(false);
      }}
      className={`${appearing && !dragging ? 'row-in' : ''} trail-row group relative flex h-(--row-height) shrink-0 items-center gap-2 rounded-row pr-1.5 text-fg-muted outline-offset-[-2px] transition-[background-color,color,box-shadow,scale] duration-fast ease-out hover:bg-row-hover hover:text-fg active:bg-row-pressed data-[paired=true]:bg-row-hover data-[paired=true]:text-fg data-[menu-open=true]:bg-row-hover data-[menu-open=true]:text-fg data-[active=true]:text-fg data-[dragging=true]:z-10 data-[dragging=true]:bg-selected data-[dragging=true]:text-fg data-[dragging=true]:scale-[1.02] data-[dragging=true]:shadow-panel`}
      style={{
        // The content keeps its place; only the box moves in.
        ...rowBox(depth, flat, minimal),
        // Rows only ever slide vertically; depth comes from the projection.
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      {preview.preview}
      {!dragging && <IndentGuides depth={depth} lines={lines} />}
      {row.hasChildren && !dragging ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed(!page.collapsed);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="trail-branch-toggle -mx-0.5 grid size-5 shrink-0 place-items-center rounded-inner text-fg-subtle transition-colors duration-fast hover:bg-pressed hover:text-fg"
        >
          <ChevronRight
            size={minimal ? 13 : 12}
            className="transition-transform duration-base ease-emphasized"
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        </button>
      ) : (
        !flat && (
          <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
            {minimal && <span className="trail-dot" />}
          </span>
        )
      )}
      {/* Holds the current page's dot, Dock-style, when that's the marker. */}
      <span className="trail-favicon relative grid shrink-0">
        <Favicon page={page} />
      </span>
      {renaming ? (
        <RenameField
          pageId={row.id}
          initial={label}
          previous={page.customTitle}
        />
      ) : (
        <span
          className="trail-label min-w-0 flex-1"
          title={label}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(row.id);
          }}
        >
          <span
            className="trail-title data-context:text-fg-subtle"
            data-context={!matched || undefined}
          >
            {filter ? (
              <Highlighted text={parts.title} query={filter} />
            ) : (
              parts.title
            )}
          </span>
          {parts.site && showSiteNames && (
            <span className="trail-site text-fg-subtle">{parts.site}</span>
          )}
        </span>
      )}
      {page.hasFormEdits && !renaming && (
        <span
          className="grid size-5 shrink-0 place-items-center text-fg-subtle"
          title="Edited fields. This page stays awake to protect your work."
          aria-label="Edited fields; kept awake"
        >
          <PencilLine size={11} aria-hidden />
        </span>
      )}
      {page.isPinned && !renaming && (
        <Pin
          size={11}
          aria-hidden
          className="shrink-0 -rotate-45 text-fg-subtle"
        />
      )}
      {download && !renaming && (
        <span
          className="grid size-6 shrink-0 place-items-center"
          title={`Downloading ${download.filename}`}
          aria-label={`Downloading ${download.filename}`}
        >
          <DownloadRing
            received={download.receivedBytes}
            total={download.totalBytes}
          />
        </span>
      )}
      {(page.isAudible || page.isMuted) && !renaming && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={page.isMuted ? `Unmute ${label}` : `Mute ${label}`}
          title={page.isMuted ? 'Unmute page' : 'Mute page'}
          onClick={(event) => {
            event.stopPropagation();
            void api().setMuted(row.id, !page.isMuted);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-inner text-fg-subtle hover:bg-pressed hover:text-fg data-[playing=true]:text-accent"
          data-playing={page.isAudible && !page.isMuted}
        >
          {page.isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      )}
      {hidden && !renaming && (
        <HiddenState
          summary={hidden}
          showAudio={!page.isAudible && !page.isMuted}
          showDownload={!download}
        />
      )}
      {!renaming && (
        <span
          data-marked={marker !== null}
          className="trail-trailing relative -ml-1 grid size-6 shrink-0 place-items-center"
        >
          {marker && (
            <span className="trail-marker text-fg-subtle group-hover:invisible group-focus-within:invisible">
              {marker}
            </span>
          )}
          <button
            type="button"
            // One stop for the whole tree: the current row and its actions.
            tabIndex={tabStop ? 0 : -1}
            aria-label={`Actions for ${label}`}
            title="Page actions"
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              openPageMenu(row.id, event);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="trail-close absolute inset-y-0 right-0 grid w-6 place-items-center rounded-inner text-fg-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-pressed hover:text-fg"
          >
            <MoreHorizontal size={14} />
          </button>
        </span>
      )}
    </div>
  );
});

/**
 * Hairlines down from each ancestor's chevron, so a deep branch still reads
 * as one branch. Each reaches across the gap below its row to join the next.
 */
function IndentGuides({
  depth,
  lines,
}: {
  depth: number;
  lines: readonly DrawnHalf[];
}) {
  const shown = useShell((state) => state.preferences?.showBranchLines ?? true);
  const minimal = useShell(selectMinimalTrail);
  if (depth === 0 || !shown || minimal) return null;
  return (
    // Measured from the trail's edge, out past the row's inset box.
    <span
      aria-hidden
      className="indent-guides pointer-events-none absolute inset-y-0"
      style={{ left: -rowOffset(depth) }}
    >
      {[depth - 1].map((level) => (
        <span
          key={level}
          className="absolute top-0 -bottom-px w-px bg-(--guide)"
          style={{ left: CHEVRON_CENTER + level * INDENT }}
        />
      ))}
      {/* The way down to the current page, ending where it turns in. */}
      {lines.map(
        (line) => line.level < depth && <PathHalf key={line.id} line={line} />,
      )}
    </span>
  );
}

const NO_LINES: readonly DrawnHalf[] = Object.freeze([]);

/** The current page's surface keeps clear of the branch lines. */
const SURFACE_INSET = 18;

/**
 * What marks the current page (app.css): its surface, and the light on the
 * line beside it. One of each for the whole trail, so picking a page above
 * or below glides them there together. Where nothing was shown before they
 * appear in place, and when rows shift under them they follow at once.
 * The light is out where there's no line to light: a top-level page,
 * branch lines turned off, or a drag.
 */
function CurrentMarker({
  treeRef,
  activeId,
  dragging,
}: {
  treeRef: RefObject<HTMLDivElement | null>;
  activeId: PageId | null;
  dragging: boolean;
}) {
  const minimal = useShell(selectMinimalTrail);
  const surfaceRef = useRef<HTMLSpanElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  // Where the surface was last put, and for which page; null while out.
  const spot = useRef<{ id: PageId; y: number } | null>(null);
  const place = useCallback(() => {
    const tree = treeRef.current;
    const surface = surfaceRef.current;
    const light = lightRef.current;
    if (!tree || !surface || !light) return;
    const row =
      activeId && !dragging
        ? tree.querySelector<HTMLElement>(
            `.trail-row[data-page-id="${CSS.escape(activeId)}"]`,
          )
        : null;
    if (!activeId || !row || row.checkVisibility?.() === false) {
      surface.dataset.shown = 'false';
      light.dataset.shown = 'false';
      spot.current = null;
      return;
    }
    const box = tree.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    const y = at.top - box.top;
    const was = spot.current;
    const glide = was !== null && was.id !== activeId;
    if (glide) {
      // Quick to a neighbour, a little longer the further it goes.
      const rows = Math.round(Math.abs(y - was.y) / at.height);
      const ms = Math.min(
        durationMs('--duration-base'),
        Math.max(durationMs('--duration-fast'), rows * 60),
      );
      tree.style.setProperty('--trail-glide', `${ms}ms`);
    }
    const inset = minimal || row.dataset.flat === 'true' ? 0 : SURFACE_INSET;
    move(surface, glide, {
      translate: `${at.left - box.left + inset}px ${y}px`,
      width: `${at.width - inset}px`,
      height: `${at.height}px`,
    });
    // The row's own branch line, the one it hangs from.
    const line = row.querySelector<HTMLElement>('.indent-guides > span');
    if (line) {
      move(light, glide && light.dataset.shown === 'true', {
        translate: `${line.getBoundingClientRect().left - box.left}px ${y}px`,
        height: `${at.height}px`,
      });
    } else {
      light.dataset.shown = 'false';
    }
    spot.current = { id: activeId, y };
  }, [treeRef, activeId, dragging, minimal]);
  // Every render: rows open, close and move under it.
  useLayoutEffect(place);
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(tree);
    return () => observer.disconnect();
  }, [treeRef, place]);
  return (
    <>
      <span ref={surfaceRef} aria-hidden className="trail-current" />
      <span ref={lightRef} aria-hidden className="trail-light" />
    </>
  );
}

/**
 * Puts a marker somewhere, gliding there or not. A marker already where
 * it's going is left alone, so a glide under way keeps running.
 */
function move(
  element: HTMLElement,
  glide: boolean,
  to: { translate: string; height: string; width?: string },
) {
  const { style } = element;
  // Compared as set, not as read back: the browser rounds what it returns.
  const target = JSON.stringify(to);
  const there =
    element.dataset.shown === 'true' && placed.get(element) === target;
  if (there) return;
  // Only opacity animates when it isn't gliding: it appears in place.
  if (!glide) style.transitionProperty = 'opacity';
  Object.assign(style, to);
  if (!glide) {
    void element.offsetWidth;
    style.transitionProperty = '';
  }
  element.dataset.shown = 'true';
  placed.set(element, target);
}

const placed = new WeakMap<HTMLElement, string>();

/**
 * Half a row of lit line. While a stroke runs, it moves only during its
 * share of the stroke's eased progress, so the halves of a path move as
 * one line. A retract starts from wherever the line is, so turning back
 * mid-stroke never jumps.
 */
function PathHalf({ line }: { line: DrawnHalf }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { stroke } = line;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !stroke) return;
    const at = scaleOf(element);
    for (const running of element.getAnimations()) running.cancel();
    element.animate(strokeFrames(stroke, at), {
      duration: strokeMs(stroke),
      easing: easing('--ease-in-out'),
      fill: stroke.direction === 'out' ? 'forwards' : 'none',
    });
  }, [stroke]);
  const top = line.half === 'top';
  return (
    <span
      ref={ref}
      className="absolute w-px origin-top bg-(--guide-path)"
      style={{
        left: CHEVRON_CENTER + line.level * INDENT,
        top: top ? 0 : '50%',
        bottom: top ? '50%' : -1,
      }}
    />
  );
}

/** Still for `from`, moving until `to`, still after. */
function strokeFrames(stroke: GuideStroke, at: number): Keyframe[] {
  const [start, end] = stroke.direction === 'in' ? [0, 1] : [at, 0];
  const scale = (value: number) => `scaleY(${value})`;
  return [
    { offset: 0, transform: scale(start) },
    { offset: stroke.from, transform: scale(start) },
    { offset: stroke.to, transform: scale(end) },
    { offset: 1, transform: scale(end) },
  ];
}

/**
 * Tight: a stroke takes a little longer the more of the trail it covers,
 * within the fast and base durations; retracting stays within the exit.
 */
function strokeMs({ direction, count }: GuideStroke): number {
  const fast = durationMs('--duration-fast');
  const most = durationMs(
    direction === 'in' ? '--duration-base' : '--duration-exit',
  );
  return Math.min(most, Math.max(fast, count * (direction === 'in' ? 40 : 30)));
}

/** The vertical scale an element is drawn at right now. */
function scaleOf(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none') return 1;
  return new DOMMatrixReadOnly(transform).d;
}

const NO_PAGES: readonly PageId[] = Object.freeze([]);

/**
 * On a collapsed row, what the pages beneath it are doing: how many there
 * are, and any sound, download or failure the user would otherwise miss.
 */
function HiddenState({
  summary,
  showAudio,
  showDownload,
}: {
  summary: HiddenSummary;
  /** The row's own speaker already shows. */
  showAudio: boolean;
  showDownload: boolean;
}) {
  const { ids, playing, failedId } = summary;
  const failedLabel = useShell((state) => {
    const failed = failedId ? state.snapshot?.pages[failedId] : undefined;
    return failed ? pageLabel(failed) : null;
  });
  const [received, total, count] = useDownloads(
    useShallow((state) => {
      const inBranch = showDownload ? ids : NO_PAGES;
      let receivedBytes = 0;
      let totalBytes = 0;
      let files = 0;
      for (const d of state.downloads) {
        if (d.state !== 'progressing' || !d.pageId) continue;
        if (!inBranch.includes(d.pageId)) continue;
        receivedBytes += d.receivedBytes;
        totalBytes += d.totalBytes;
        files++;
      }
      return [receivedBytes, totalBytes, files];
    }),
  );
  const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
  const muteLabel = `Mute ${pages(playing.length)} playing in this branch`;
  const downloading = `Downloading ${count} ${count === 1 ? 'file' : 'files'} in this branch`;

  return (
    <>
      {count > 0 && (
        <span
          className="grid size-6 shrink-0 place-items-center"
          title={downloading}
          aria-label={downloading}
        >
          <DownloadRing received={received} total={total} />
        </span>
      )}
      {showAudio && playing.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={muteLabel}
          title={muteLabel}
          onClick={(event) => {
            event.stopPropagation();
            for (const id of playing) void api().setMuted(id, true);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-inner text-accent hover:bg-pressed"
        >
          <Volume2 size={13} />
        </button>
      )}
      {failedId && failedLabel && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show “${failedLabel}”, which has a problem`}
          title={`“${failedLabel}” has a problem. Click to show it.`}
          onClick={(event) => {
            event.stopPropagation();
            void api().activatePage(failedId);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-inner text-danger hover:bg-pressed"
        >
          <CircleAlert size={13} />
        </button>
      )}
      <span
        className="shrink-0 text-caption text-fg-subtle tabular-nums"
        title={`${pages(ids.length)} hidden in this branch`}
        aria-hidden
      >
        {ids.length}
      </span>
    </>
  );
}

function RenameField({
  pageId,
  initial,
  previous,
}: {
  pageId: PageId;
  initial: string;
  /** The page's own name before this rename, for undo. */
  previous: string | null;
}) {
  const finishRename = useShell((state) => state.finishRename);
  // Enter commits, then the field unmounts and blurs; commit only once.
  const settled = useRef(false);

  const commit = (value: string) => {
    if (settled.current) return;
    settled.current = true;
    finishRename();
    const name = value.trim();
    if (name === initial) return;
    const splash = api();
    void splash.renamePage(pageId, name || null).then(() => {
      useToast.getState().show(
        renamedToast(
          name || null,
          () => splash.renamePage(pageId, previous),
          () => splash.renamePage(pageId, name || null),
        ),
      );
    });
  };
  const cancel = () => {
    settled.current = true;
    finishRename();
  };

  return (
    <input
      autoFocus
      defaultValue={initial}
      aria-label="Page name"
      maxLength={300}
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit(event.currentTarget.value);
        if (event.key === 'Escape') cancel();
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      className="editing-field h-[22px] min-w-0 flex-1 rounded-inner px-1.5 text-fg select-text"
    />
  );
}

function TrailSkeleton() {
  const widths = ['72%', '58%', '64%', '44%'];
  return (
    <div
      aria-busy="true"
      aria-label="Loading pages"
      className="flex flex-col gap-px"
    >
      {widths.map((width, index) => (
        <div
          key={width}
          className="flex h-(--row-height) items-center gap-2"
          style={{
            paddingLeft: FLAT_LEAD + (index === 1 || index === 2 ? INDENT : 0),
          }}
        >
          <span className="skeleton size-4 shrink-0" />
          <span className="skeleton h-2.5" style={{ width }} />
        </div>
      ))}
    </div>
  );
}

function TrailEmpty() {
  const workspaces = useShell(selectWorkspaces);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const name = workspaces.find((w) => w.id === activeId)?.name;
  const several = workspaces.length > 1;
  return (
    <div className="pt-3 pr-3 pb-2 pl-2.5">
      <p className="text-fg-muted">
        {several && name ? `“${name}” is empty` : 'No pages yet'}
      </p>
      <p className="mt-1 text-small leading-copy text-fg-subtle">
        {several
          ? 'Pages you open here stay in this workspace, nested under the page they came from.'
          : 'Pages you open appear here, nested under the page they came from.'}
      </p>
    </div>
  );
}

/** The filter found nothing; ⌘K looks further, through history and the web. */
function FilterEmpty({ query }: { query: string }) {
  return (
    <div role="status" className="pt-3 pr-3 pb-2 pl-2.5">
      <p className="text-fg-muted wrap-anywhere">No pages match “{query}”</p>
      <p className="mt-1 text-small leading-copy text-fg-subtle">
        Check the spelling, or search history and the web.
      </p>
      <button
        type="button"
        className="button button-raised button-sm mt-3"
        onClick={() =>
          useOverlay.getState().open({ kind: 'palette', scope: 'palette' })
        }
      >
        Search everywhere
        <kbd className="shortcut">⌘K</kbd>
      </button>
    </div>
  );
}
