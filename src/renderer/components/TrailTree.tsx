import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  closestCenter,
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import {
  ChevronRight,
  CircleAlert,
  Columns2,
  Moon,
  Pin,
  StickyNote,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { PageId } from '../../shared/types';
import {
  projectDrop,
  rowsWhileDragging,
  type DropProjection,
} from '../lib/drop-projection';
import { pageLabel, pageParts } from '../lib/format';
import {
  hiddenSummary,
  visibleRows,
  type HiddenSummary,
  type TrailRow as Row,
} from '../lib/trail';
import { api } from '../splash-api';
import {
  selectFlatTrail,
  selectVisibleSplit,
  selectWorkspaces,
  useShell,
} from '../stores/shell-store';
import { useDownloads } from '../stores/downloads-store';
import { DownloadRing } from './DownloadRing';
import { Favicon } from './Favicon';
import { PageNote } from './PageNote';

const INDENT = 14;
/** Where a row's chevron sits, so guides line up under it. */
const CHEVRON_CENTER = 6 + 8;
/** Where a top-level favicon starts, after the chevron column or without it. */
const LEAD = 6 + 16 + 8;
const FLAT_LEAD = 10;

interface DragState {
  activeId: PageId;
  overId: PageId;
  offsetX: number;
}

export function TrailTree() {
  const snapshot = useShell((state) => state.snapshot);
  const visibleSplit = useShell(selectVisibleSplit);
  const flat = useShell(selectFlatTrail);
  // Rows that arrive after the first paint grow in; the first ones don't.
  const painted = useRef(false);
  useEffect(() => {
    painted.current = true;
  }, []);
  const [drag, setDrag] = useState<DragState | null>(null);
  // A small threshold keeps plain clicks from turning into drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const allRows = useMemo(
    () => (snapshot ? visibleRows(snapshot) : []),
    [snapshot],
  );
  // Collapsed rows stand in for the pages beneath them.
  const hidden = useMemo(() => {
    const summaries = new Map<PageId, HiddenSummary>();
    if (!snapshot) return summaries;
    for (const row of allRows) {
      const summary = hiddenSummary(snapshot, row.id);
      if (summary) summaries.set(row.id, summary);
    }
    return summaries;
  }, [snapshot, allRows]);
  const rows = drag ? rowsWhileDragging(allRows, drag.activeId) : allRows;
  const projection: DropProjection | null = drag
    ? projectDrop(allRows, drag.activeId, drag.overId, drag.offsetX, INDENT)
    : null;

  if (snapshot === null) return <TrailSkeleton />;
  if (allRows.length === 0) return <TrailEmpty />;

  const split = snapshot.split;
  const isInSplit = (id: PageId) =>
    split !== null && (split.leftId === id || split.rightId === id);

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setDrag({ activeId: id, overId: id, offsetX: 0 });
  };
  const onDragMove = ({ active, over, delta }: DragMoveEvent) => {
    setDrag({
      activeId: String(active.id),
      overId: over ? String(over.id) : String(active.id),
      offsetX: delta.x,
    });
  };
  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    setDrag(null);
    if (!over) return;
    const target = projectDrop(
      allRows,
      String(active.id),
      String(over.id),
      delta.x,
      INDENT,
    );
    if (!target) return;
    const current = allRows.find((row) => row.id === active.id);
    const unchanged =
      current?.parentId === target.parentId &&
      target.afterId === previousSiblingId(allRows, String(active.id));
    if (!unchanged) {
      void api().movePage(String(active.id), target.parentId, target.afterId);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext
        items={rows.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        <div role="tree" aria-label="Pages" className="flex flex-col gap-px">
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TrailRow
                row={row}
                depth={
                  row.id === drag?.activeId && projection
                    ? projection.depth
                    : row.depth
                }
                active={row.id === snapshot.activePageId}
                inSplit={isInSplit(row.id)}
                paired={
                  visibleSplit !== null &&
                  row.id !== snapshot.activePageId &&
                  isInSplit(row.id)
                }
                dragging={row.id === drag?.activeId}
                hidden={hidden.get(row.id) ?? null}
                flat={flat}
                appear={painted.current}
              />
              {!drag && (
                <PageNote
                  pageId={row.id}
                  depth={row.depth}
                  indent={INDENT}
                  lead={flat ? FLAT_LEAD : LEAD}
                />
              )}
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** The sibling directly above a row, at the same depth. */
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

const TrailRow = memo(function TrailRow({
  row,
  depth,
  active,
  inSplit,
  paired,
  dragging,
  hidden,
  flat,
  appear,
}: {
  row: Row;
  depth: number;
  active: boolean;
  /** One of the two pages of the workspace's split view. */
  inSplit: boolean;
  /** On screen beside the active page. */
  paired: boolean;
  dragging: boolean;
  hidden: HiddenSummary | null;
  /** No row has a chevron, so none keeps a column for one. */
  flat: boolean;
  /** Animate in on mount: the row was just opened or revealed. */
  appear: boolean;
}) {
  const page = useShell((state) => state.snapshot?.pages[row.id]);
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
  const [appearing, setAppearing] = useState(appear);

  // A page activated from elsewhere (the palette, a link, ⌘1–9) is
  // scrolled into view, so the trail always shows where you are.
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!page) return null;

  const expanded = row.hasChildren ? !page.collapsed : undefined;
  const label = pageLabel(page);
  const parts = pageParts(page);
  // One quiet marker at the row's end; close takes its place on hover.
  const marker = inSplit ? (
    <Columns2 size={11} strokeWidth={2} aria-label="In split view" />
  ) : page.note ? (
    <StickyNote size={11} strokeWidth={2} aria-label="Has a note" />
  ) : page.isDiscarded && !active ? (
    <Moon
      size={10}
      strokeWidth={2}
      aria-label="Asleep"
      className="opacity-60"
    />
  ) : null;

  const activate = () => void api().activatePage(row.id);
  const close = (event: MouseEvent) => {
    event.stopPropagation();
    void api().closePage(row.id);
  };
  const setCollapsed = (collapsed: boolean) =>
    void api().setCollapsed(row.id, collapsed);

  const onKeyDown = (event: KeyboardEvent) => {
    if (renaming) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    } else if (event.key === 'ArrowLeft' && expanded) {
      setCollapsed(true);
    } else if (event.key === 'ArrowRight' && expanded === false) {
      setCollapsed(false);
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
      aria-roledescription="page"
      tabIndex={active ? 0 : -1}
      // Rows truncate, so the tooltip leads with the whole title.
      title={[
        label,
        page.url,
        page.isPinned && 'Pinned. Closing puts it to sleep instead.',
        page.isDiscarded && 'Asleep to save memory. Opens where you left it.',
        inSplit &&
          (paired
            ? 'Beside the current page in split view.'
            : 'In split view. Opens beside its pair.'),
      ]
        .filter(Boolean)
        .join('\n')}
      onClick={activate}
      onAuxClick={(event) => event.button === 1 && close(event)}
      onContextMenu={(event) => {
        event.preventDefault();
        void api().showPageMenu(row.id);
      }}
      onKeyDown={onKeyDown}
      data-active={active}
      data-paired={paired}
      data-dragging={dragging}
      data-discarded={page.isDiscarded}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setAppearing(false);
      }}
      className={`${appearing && !dragging ? 'row-in' : ''} trail-row group relative flex h-[var(--row-height)] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-1.5 text-fg-muted outline-offset-[-2px] transition-[background-color,color,box-shadow,scale] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-row-hover hover:text-fg active:bg-row-pressed data-[paired=true]:bg-row-hover data-[paired=true]:text-fg data-[active=true]:text-fg data-[dragging=true]:z-10 data-[dragging=true]:bg-selected data-[dragging=true]:text-fg data-[dragging=true]:scale-[1.02] data-[dragging=true]:shadow-[var(--shadow-panel)]`}
      style={{
        paddingLeft: (flat ? FLAT_LEAD : 6) + depth * INDENT,
        // Rows only ever slide vertically; depth comes from the projection.
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      {!dragging && <IndentGuides depth={depth} />}
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
          className="-mx-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius-inner)] text-fg-subtle transition-colors duration-[var(--duration-fast)] hover:bg-pressed hover:text-fg"
        >
          <ChevronRight
            size={12}
            strokeWidth={2}
            className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-emphasized)]"
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        </button>
      ) : (
        !flat && <span className="size-4 shrink-0" aria-hidden />
      )}
      {/* Holds the current page's dot, Dock-style, when that's the marker. */}
      <span className="trail-favicon relative grid shrink-0">
        <Favicon page={page} />
      </span>
      {renaming ? (
        <RenameField pageId={row.id} initial={label} />
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(row.id);
          }}
        >
          <span className="trail-title">{parts.title}</span>
          {parts.site && showSiteNames && (
            <span className="ml-1.5 text-fg-subtle">{parts.site}</span>
          )}
        </span>
      )}
      {page.isPinned && !renaming && (
        <Pin
          size={11}
          strokeWidth={2}
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
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-[var(--radius-inner)] text-fg-subtle hover:bg-pressed hover:text-fg data-[playing=true]:text-accent"
          data-playing={page.isAudible && !page.isMuted}
        >
          {page.isMuted ? (
            <VolumeX size={13} strokeWidth={2} />
          ) : (
            <Volume2 size={13} strokeWidth={2} />
          )}
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
          className="trail-trailing relative -ml-1 grid h-6 w-0 shrink-0 place-items-center group-hover:w-6 group-data-[active=true]:w-6 data-[marked=true]:w-6"
        >
          {marker && (
            <span className="trail-marker text-fg-subtle group-hover:invisible group-data-[active=true]:invisible">
              {marker}
            </span>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label={
              page.isPinned ? `Put ${label} to sleep` : `Close ${label}`
            }
            title={
              page.isPinned
                ? 'Put to sleep (⌘W). Pinned pages stay in the trail.'
                : 'Close page (⌘W)'
            }
            onClick={close}
            onPointerDown={(event) => event.stopPropagation()}
            className="trail-close absolute inset-y-0 right-0 grid w-6 place-items-center rounded-[var(--radius-inner)] text-fg-subtle opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:bg-pressed hover:text-fg"
          >
            <X size={12} strokeWidth={2} />
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
function IndentGuides({ depth }: { depth: number }) {
  const shown = useShell((state) => state.preferences?.showBranchLines ?? true);
  if (depth === 0 || !shown) return null;
  return (
    // A raised or outlined current row breaks its branch's lines (app.css).
    <span
      aria-hidden
      className="indent-guides pointer-events-none absolute inset-y-0 left-0"
    >
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          className="absolute top-0 -bottom-px w-px bg-divider"
          style={{ left: CHEVRON_CENTER + level * INDENT }}
        />
      ))}
    </span>
  );
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
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-[var(--radius-inner)] text-accent hover:bg-pressed"
        >
          <Volume2 size={13} strokeWidth={2} />
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
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-[var(--radius-inner)] text-danger hover:bg-pressed"
        >
          <CircleAlert size={13} strokeWidth={2} />
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

function RenameField({ pageId, initial }: { pageId: PageId; initial: string }) {
  const finishRename = useShell((state) => state.finishRename);
  // Enter commits, then the field unmounts and blurs; commit only once.
  const settled = useRef(false);

  const commit = (value: string) => {
    if (settled.current) return;
    settled.current = true;
    finishRename();
    if (value.trim() !== initial) void api().renamePage(pageId, value);
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
      className="editing-field h-[22px] min-w-0 flex-1 rounded-[var(--radius-inner)] px-1.5 text-fg select-text"
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
          className="flex h-[var(--row-height)] items-center gap-2"
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
      <p className="mt-1 text-small leading-[1.45] text-fg-subtle">
        {several
          ? 'Pages you open here stay in this workspace, nested under the page they came from.'
          : 'Pages you open appear here, nested under the page they came from.'}
      </p>
    </div>
  );
}
