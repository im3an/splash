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
import { History, Plus, Settings } from 'lucide-react';
import type { WorkspaceSummary } from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { DownloadsButton } from './DownloadsButton';
import { WorkspaceIcon } from './WorkspaceIcon';

/**
 * The sidebar's foot, like Arc's: downloads and history at the start, every
 * workspace in the middle (click to switch, drag to reorder), settings and
 * a new workspace at the end.
 */
export function WorkspaceBar() {
  const workspaces = useShell(selectWorkspaces);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const openOverlay = useOverlay((state) => state.open);
  const togglePanel = useShell((state) => state.toggleSidebarPanel);
  const historyShowing = useShell((state) => state.sidebarPanel === 'history');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const index = workspaces.findIndex((w) => w.id === over.id);
    if (index !== -1) void api().moveWorkspace(String(active.id), index);
  };

  const create = () =>
    void openOverlay({ kind: 'workspace-editor', workspaceId: null });

  return (
    <div className="grid h-11 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-1 pb-1">
      <div className="flex gap-0.5">
        <DownloadsButton always />
        <button
          type="button"
          onClick={() => togglePanel('history')}
          aria-label="History"
          aria-pressed={historyShowing}
          title="History (⌘Y)"
          className="icon-button shrink-0 aria-pressed:bg-row-hover aria-pressed:text-fg"
        >
          <History size={15} strokeWidth={1.75} />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={workspaces.map((w) => w.id)}
          strategy={horizontalListSortingStrategy}
        >
          {/* Padded so a focus ring isn't clipped by the scroller. */}
          <div
            role="tablist"
            aria-label="Workspaces"
            onKeyDown={(event) => {
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const current = tabs.indexOf(event.target as HTMLButtonElement);
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
              const workspace = workspaces[next];
              if (workspace && workspace.id !== activeId)
                void api().switchWorkspace(workspace.id);
            }}
            className="-m-1 flex min-w-0 items-center gap-0.5 overflow-x-auto p-1"
          >
            {workspaces.map((workspace, index) => (
              <WorkspaceChip
                key={workspace.id}
                workspace={workspace}
                index={index}
                active={workspace.id === activeId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex gap-0.5 justify-self-end">
        <button
          type="button"
          onClick={() => void api().openSettings()}
          aria-label="Settings"
          title="Settings (⌘,)"
          className="icon-button shrink-0"
        >
          <Settings size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={create}
          aria-label="New workspace"
          title="New workspace (⇧⌘N)"
          className="icon-button shrink-0"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
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
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, 0, 0)`
          : undefined,
        transition,
      }}
      // Arc's space dots: the others fade back, the current one is solid.
      className="grid size-7 shrink-0 place-items-center rounded-control text-small font-semibold text-fg-subtle opacity-70 transition-[color,background-color,opacity,scale] duration-fast ease-out hover:bg-row-hover active:scale-[0.9] hover:text-fg hover:opacity-100 data-[active=true]:bg-row-hover data-[active=true]:text-accent data-[active=true]:opacity-100"
    >
      <WorkspaceIcon icon={workspace.appearance.icon} name={workspace.name} />
    </button>
  );
}
