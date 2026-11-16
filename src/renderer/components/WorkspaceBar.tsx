import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { Archive, ArrowDownToLine, Clock, Plus, Star } from '../icons';
import type { WorkspaceSummary } from '../../shared/types';
import { api } from '../splash-api';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { useWorkspaceSlide } from '../lib/use-workspace-slide';
import { useDownloads } from '../stores/downloads-store';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { WorkspaceButton } from './WorkspaceButton';
import { AlmaViewButton } from '../prototype/AlmaViewPrototype';

/**
 * The sidebar's foot: the current workspace's name with one dot per
 * workspace beneath it (click to switch, drag to reorder, drop a page from
 * the trail on one to move it there) and a plus for a new workspace.
 */
export function WorkspaceBar() {
  const workspaces = useShell(selectWorkspaces);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const index = workspaces.findIndex((w) => w.id === over.id);
    if (index !== -1) void api().moveWorkspace(String(active.id), index);
  };

  const editWorkspace = useShell((state) => state.editWorkspace);
  const create = () => editWorkspace(null);

  const slide = useWorkspaceSlide();
  const almaButton = useShell(
    (state) =>
      import.meta.env.DEV && (state.preferences?.almaViewButton ?? true),
  );

  // At most five circles show, a window that follows the current one and
  // fades out on whichever side has more.
  const MAX = 5;
  const activeIndex = Math.max(
    0,
    workspaces.findIndex((w) => w.id === activeId),
  );
  const from = Math.min(
    Math.max(0, activeIndex - 2),
    Math.max(0, workspaces.length - MAX),
  );
  const visible = workspaces.slice(from, from + MAX);
  const fadeStart = from > 0;
  const fadeEnd = from + MAX < workspaces.length;

  return (
    <div className="grid shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-end gap-1 pt-1 pb-1.5">
      <LibraryButton />
      <div className="group/ws flex min-w-0 flex-col items-center gap-0.5">
        <div key={activeId} className={`max-w-full ${slide}`}>
          <WorkspaceButton />
        </div>
        <div className="relative flex h-5 max-w-full items-center">
          {
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={visible.map((w) => w.id)}
                strategy={horizontalListSortingStrategy}
              >
                {/* Padded so a focus ring isn't clipped by the scroller. */}
                <div
                  role="tablist"
                  data-fade-start={fadeStart}
                  data-fade-end={fadeEnd}
                  aria-label="Workspaces"
                  onKeyDown={(event) => {
                    const tabs = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      ),
                    );
                    const current = tabs.indexOf(
                      event.target as HTMLButtonElement,
                    );
                    if (current < 0) return;
                    let next: number;
                    switch (event.key) {
                      case 'ArrowRight':
                        next = (current + 1) % tabs.length;
                        break;
                      case 'ArrowLeft':
                        next = (current - 1 + tabs.length) % tabs.length;
                        break;
                      case 'Home':
                        next = 0;
                        break;
                      case 'End':
                        next = tabs.length - 1;
                        break;
                      default:
                        return;
                    }
                    event.preventDefault();
                    tabs[next]?.focus();
                    const workspace = visible[next];
                    if (workspace && workspace.id !== activeId)
                      void api().switchWorkspace(workspace.id);
                  }}
                  className="workspace-strip flex items-center"
                >
                  {visible.map((workspace, i) => (
                    <WorkspaceChip
                      key={workspace.id}
                      workspace={workspace}
                      index={from + i}
                      active={workspace.id === activeId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          }
          <button
            type="button"
            onClick={create}
            aria-label="New workspace"
            title="New workspace (⇧⌘N)"
            className={`pointer-events-none absolute top-1/2 grid size-5 -translate-y-1/2 scale-75 left-full ml-0.5 place-items-center rounded-full text-fg-subtle/60 opacity-0 transition-[opacity,scale,color] duration-slow ease-emphasized group-focus-within/ws:pointer-events-auto group-focus-within/ws:scale-100 group-focus-within/ws:opacity-100 group-hover/ws:pointer-events-auto group-hover/ws:scale-100 group-hover/ws:opacity-100 hover:text-fg-muted`}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
      {almaButton ? <AlmaViewButton /> : <span aria-hidden />}
    </div>
  );
}

/** Downloads, History and Bookmarks behind one box, so the foot stays quiet. */
function LibraryButton() {
  const menu = useSidebarMenu('Library');
  const togglePanel = useShell((state) => state.toggleSidebarPanel);
  const panel = useShell((state) => state.sidebarPanel);
  const unseenProblems = useDownloads((state) => state.unseenProblems);
  const progressing = useDownloads((state) =>
    state.downloads.some((d) => d.state === 'progressing'),
  );
  return (
    <>
      <button
        type="button"
        onClick={(event) =>
          menu.show(
            event,
            [
              {
                kind: 'action',
                label: 'Downloads',
                icon: <ArrowDownToLine size={15} />,
                shortcut: '⌥⌘L',
                run: () => togglePanel('downloads'),
              },
              {
                kind: 'action',
                label: 'History',
                icon: <Clock size={15} />,
                shortcut: '⌘Y',
                run: () => togglePanel('history'),
              },
              {
                kind: 'action',
                label: 'Bookmarks',
                icon: <Star size={15} />,
                shortcut: '⌥⌘B',
                run: () => togglePanel('bookmarks'),
              },
            ],
            true,
          )
        }
        aria-label="Downloads, History and Bookmarks"
        aria-haspopup="menu"
        aria-pressed={
          panel === 'downloads' || panel === 'history' || panel === 'bookmarks'
        }
        title="Downloads, History and Bookmarks"
        className="icon-button relative shrink-0 justify-self-start"
      >
        <Archive size={16} />
        {(unseenProblems > 0 || progressing) && (
          <span
            className={`absolute top-1 right-1 size-1.5 rounded-full ${unseenProblems > 0 ? 'bg-danger' : 'bg-accent'}`}
            aria-hidden
          />
        )}
      </button>
      {menu.element}
    </>
  );
}

function WorkspaceChip({
  workspace,
  index,
  active,
}: {
  workspace: WorkspaceSummary;
  index: number;
  active: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: workspace.id });
  // A page dragged from the trail is over this workspace.
  const dropping = useShell((state) => state.workspaceDropId === workspace.id);
  const shortcut = index < 9 ? ` (⌃${index + 1})` : '';

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      aria-label={workspace.name}
      title={`${workspace.name} · ${workspace.pageCount} page${workspace.pageCount === 1 ? '' : 's'}${shortcut}`}
      onClick={() => void api().switchWorkspace(workspace.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!active) void api().switchWorkspace(workspace.id);
        void api().showWorkspaceMenu();
      }}
      data-active={active}
      data-workspace-id={workspace.id}
      data-drop={dropping}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, 0, 0)`
          : undefined,
        transition,
      }}
      className="group/dot relative grid size-5 shrink-0 place-items-center rounded-full outline-offset-0 data-[drop=true]:bg-accent-soft"
    >
      <span
        aria-hidden
        className="grid size-2 place-items-center rounded-full bg-fg-subtle/30 text-caption leading-none font-medium text-fg-subtle/70 transition-[background-color,color,scale,width,height] duration-slow ease-emphasized group-hover/dot:bg-fg-subtle/50 group-active/dot:scale-90 group-data-[active=true]/dot:size-3.5 group-data-[active=true]/dot:bg-fg-subtle/30 group-data-[drop=true]/dot:scale-125"
      >
        <span className="scale-50 opacity-0 transition-[opacity,scale] duration-slow ease-emphasized group-data-[active=true]/dot:scale-100 group-data-[active=true]/dot:opacity-100">
          {index + 1}
        </span>
      </span>
    </button>
  );
}
