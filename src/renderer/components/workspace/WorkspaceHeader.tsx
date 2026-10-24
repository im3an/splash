import type { MouseEvent } from 'react';
import { Ellipsis } from 'lucide-react';
import { WORKSPACE_NAME_MAX } from '../../../shared/ipc';
import { workspaceMenu } from '../../commands/menus';
import { attempt, runCommand } from '../../commands/run-command';
import { api } from '../../splash-api';
import { selectActiveWorkspace, useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';
import { InlineEdit } from '../common/InlineEdit';
import { WorkspaceDot } from './WorkspaceDot';

export function openWorkspaceMenu(
  workspaceId: string,
  anchor: { x: number; y: number },
  returnFocus: HTMLElement | null,
  viaKeyboard = false,
): void {
  const snapshot = useShell.getState().snapshot;
  if (!snapshot) return;
  useUi.getState().openContextMenu({
    ...anchor,
    entries: workspaceMenu(snapshot, workspaceId),
    returnFocus,
    viaKeyboard,
  });
}

/** The active workspace's name, renamable in place, and its actions menu. */
export function WorkspaceHeader() {
  const workspace = useShell(selectActiveWorkspace);
  const editing = useUi(
    (state) =>
      state.editing?.kind === 'workspace' && state.editing.id === workspace?.id,
  );
  if (!workspace) {
    return <div className="mx-2 mb-1 h-8 shrink-0" aria-hidden />;
  }

  const commit = (value: string) => {
    useUi.getState().stopEditing();
    const name = value.trim();
    // An empty name is not allowed; leaving it empty keeps the old one.
    if (name && name !== workspace.name) {
      void attempt(
        () => api().renameWorkspace(workspace.id, name),
        'Couldn’t rename the workspace.',
      );
    }
  };

  const onMenuButton = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openWorkspaceMenu(
      workspace.id,
      { x: rect.left, y: rect.bottom + 4 },
      event.currentTarget,
      event.detail === 0,
    );
  };

  return (
    <div
      className="group mb-1 flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-1 pl-2"
      onContextMenu={(event) => {
        event.preventDefault();
        openWorkspaceMenu(
          workspace.id,
          { x: event.clientX, y: event.clientY },
          null,
        );
      }}
    >
      <WorkspaceDot color={workspace.color} />
      {editing ? (
        <InlineEdit
          initial={workspace.name}
          label="Workspace name"
          maxLength={WORKSPACE_NAME_MAX}
          onCommit={commit}
          onCancel={() => useUi.getState().stopEditing()}
          className="-ml-1.5 font-semibold"
        />
      ) : (
        <h2
          className="min-w-0 flex-1 truncate font-semibold tracking-[-0.005em]"
          title="Double-click to rename"
          onDoubleClick={() => void runCommand('workspace.rename')}
        >
          {workspace.name}
        </h2>
      )}
      <button
        type="button"
        className="icon-button size-6 shrink-0"
        aria-label={`${workspace.name} actions`}
        aria-haspopup="menu"
        title="Workspace actions"
        onClick={onMenuButton}
      >
        <Ellipsis size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
