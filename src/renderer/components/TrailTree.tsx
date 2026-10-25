import {
  Fragment,
  memo,
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
import {
  ChevronRight,
  Columns2,
  Moon,
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
import { visibleRows, type TrailRow as Row } from '../lib/trail';
import { api } from '../splash-api';
import {
  selectVisibleSplit,
  selectWorkspaces,
  useShell,
} from '../stores/shell-store';
import { useDownloads } from '../stores/downloads-store';
import { DownloadRing } from './DownloadRing';
import { Favicon } from './Favicon';
import { PageNote } from './PageNote';

const INDENT = 14;

interface DragState {
  activeId: PageId;
  overId: PageId;
  offsetX: number;
}

export function TrailTree() {
  const snapshot = useShell((state) => state.snapshot);
  const visibleSplit = useShell(selectVisibleSplit);
  const [drag, setDrag] = useState<DragState | null>(null);
  // A small threshold keeps plain clicks from turning into drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const allRows = useMemo(
    () => (snapshot ? visibleRows(snapshot) : []),
    [snapshot],
  );
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
              />
              {!drag && (
                <PageNote pageId={row.id} depth={row.depth} indent={INDENT} />
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
}: {
  row: Row;
  depth: number;
  active: boolean;
  /** One of the two pages of the workspace's split view. */
  inSplit: boolean;
  /** On screen beside the active page. */
  paired: boolean;
  dragging: boolean;
}) {
  const page = useShell((state) => state.snapshot?.pages[row.id]);
  const renaming = useShell((state) => state.renamingPageId === row.id);
  const download = useDownloads((state) =>
    state.downloads.find(
      (d) => d.pageId === row.id && d.state === 'progressing',
    ),
  );
  const startRename = useShell((state) => state.startRename);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id, disabled: renaming });

  if (!page) return null;

  const expanded = row.hasChildren ? !page.collapsed : undefined;
  const label = pageLabel(page);
  const parts = pageParts(page);

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
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={active}
      aria-expanded={expanded}
      aria-label={label}
      aria-roledescription="page"
      tabIndex={active ? 0 : -1}
      title={
        page.isDiscarded
          ? `${page.url ?? label}\nAsleep to save memory. Opens where you left it.`
          : (page.url ?? undefined)
      }
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
      className="group relative flex h-[var(--row-height)] items-center gap-2 rounded-[var(--radius-row)] pr-1 text-fg-muted outline-offset-[-2px] transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg data-[paired=true]:bg-hover data-[paired=true]:text-fg data-[active=true]:bg-elevated data-[active=true]:text-fg data-[active=true]:shadow-[var(--shadow-row)] data-[dragging=true]:z-10 data-[dragging=true]:bg-elevated data-[dragging=true]:text-fg data-[dragging=true]:shadow-[var(--shadow-row)]"
      style={{
        paddingLeft: 4 + depth * INDENT,
        // Rows only ever slide vertically; depth comes from the projection.
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
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
          className="-mx-1 grid size-6 shrink-0 place-items-center rounded-[5px] text-fg-subtle hover:bg-pressed hover:text-fg"
        >
          <ChevronRight
            size={12}
            strokeWidth={2}
            className="transition-transform duration-[var(--duration-fast)] ease-out"
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <Favicon page={page} />
      {renaming ? (
        <RenameField pageId={row.id} initial={label} />
      ) : (
        <span
          className="min-w-0 flex-1 truncate group-data-[discarded=true]:text-fg-subtle"
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(row.id);
          }}
        >
          {parts.title}
          {parts.site && (
            <span className="ml-1.5 text-fg-subtle">{parts.site}</span>
          )}
        </span>
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
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-[5px] text-fg-subtle hover:bg-pressed hover:text-fg data-[playing=true]:text-accent"
          data-playing={page.isAudible && !page.isMuted}
        >
          {page.isMuted ? (
            <VolumeX size={13} strokeWidth={2} />
          ) : (
            <Volume2 size={13} strokeWidth={2} />
          )}
        </button>
      )}
      {inSplit && !renaming && (
        <Columns2
          size={11}
          strokeWidth={2}
          className="shrink-0 text-fg-subtle group-hover:hidden"
          aria-label="In split view"
        />
      )}
      {page.isDiscarded && !active && !renaming && !page.note && !inSplit && (
        <Moon
          size={10}
          strokeWidth={2}
          className="shrink-0 text-fg-subtle opacity-70 group-hover:hidden"
          aria-label="Asleep"
        />
      )}
      {page.note && !renaming && !inSplit && (
        <StickyNote
          size={11}
          strokeWidth={2}
          className="shrink-0 text-fg-subtle group-hover:hidden"
          aria-label="Has a note"
        />
      )}
      {!renaming && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${label}`}
          title="Close page (⌘W)"
          onClick={close}
          onPointerDown={(event) => event.stopPropagation()}
          className="-my-1 grid size-6 shrink-0 place-items-center rounded-[5px] text-fg-subtle opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:bg-pressed hover:text-fg"
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
});

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
      className="h-[22px] min-w-0 flex-1 rounded-[5px] bg-field-focus px-1.5 text-fg shadow-[0_0_0_1px_var(--hairline),0_0_0_3px_var(--accent-soft)] outline-none select-text"
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
          className="flex h-[30px] items-center gap-2"
          style={{
            paddingLeft: 24 + (index === 1 || index === 2 ? INDENT : 0),
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
    <div className="px-3 pt-3 pb-2">
      <p className="text-fg-muted">
        {several && name ? `“${name}” is empty` : 'No pages yet'}
      </p>
      <p className="mt-1 text-[12px] leading-[1.45] text-fg-subtle">
        {several
          ? 'Pages you open here stay in this workspace, nested under the page they came from.'
          : 'Pages you open appear here, nested under the page they came from.'}
      </p>
    </div>
  );
}
