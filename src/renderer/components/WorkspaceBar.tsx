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
import { Plus } from 'lucide-react';
import type { WorkspaceSummary } from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { WorkspaceIcon } from './WorkspaceIcon';

/** All workspaces at a glance: click to switch, drag to reorder. */
export function WorkspaceBar() {
  const workspaces = useShell(selectWorkspaces);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const openOverlay = useOverlay((state) => state.open);
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
    <div className="flex shrink-0 items-center gap-1 border-t border-divider px-1 pt-2 pb-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={workspaces.map((w) => w.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            role="tablist"
            aria-label="Workspaces"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
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
      <button
        type="button"
        onClick={create}
        aria-label="New workspace"
        title="New workspace (⇧⌘N)"
        className="icon-button size-7 shrink-0"
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>
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
      className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] text-[12px] font-semibold text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg data-[active=true]:bg-elevated data-[active=true]:text-accent data-[active=true]:shadow-[var(--shadow-row)]"
    >
      <WorkspaceIcon icon={workspace.appearance.icon} name={workspace.name} />
    </button>
  );
}
