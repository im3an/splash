import type { KeyboardEvent } from 'react';
import type { WorkspaceSummary } from '../../../shared/types';
import { Plus } from 'lucide-react';
import type { CommandId } from '../../../shared/commands';
import { attempt, runCommand } from '../../commands/run-command';
import { api } from '../../splash-api';
import { useShell } from '../../stores/shell-store';
import { shortcutLabel, withShortcut } from '../common/Shortcut';
import { WorkspaceDot } from './WorkspaceDot';
import { openWorkspaceMenu } from './WorkspaceHeader';

const NO_WORKSPACES: WorkspaceSummary[] = [];

/** One dot per workspace along the sidebar's foot, Arc-style. */
export function WorkspaceSwitcher() {
  const workspaces = useShell(
    (state) => state.snapshot?.workspaces ?? NO_WORKSPACES,
  );
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);

  // Arrow keys move between workspaces within the group.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-workspace-id]',
      ),
    ];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    buttons.at((index + step) % buttons.length)?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Workspaces"
      className="flex min-w-0 items-center gap-0.5"
      onKeyDown={onKeyDown}
    >
      {workspaces.map((workspace, index) => {
        const active = workspace.id === activeId;
        const slot =
          index < 9 ? (`workspace.select-${index + 1}` as CommandId) : null;
        const shortcut = slot ? shortcutLabel(slot) : null;
        return (
          <button
            key={workspace.id}
            type="button"
            data-workspace-id={workspace.id}
            aria-label={`${workspace.name} workspace`}
            aria-pressed={active}
            tabIndex={active ? 0 : -1}
            title={
              shortcut ? `${workspace.name} (${shortcut})` : workspace.name
            }
            onClick={() => {
              if (active) return;
              void attempt(
                () => api().activateWorkspace(workspace.id),
                'Couldn’t switch workspaces.',
              );
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              openWorkspaceMenu(
                workspace.id,
                { x: event.clientX, y: event.clientY },
                event.currentTarget,
              );
            }}
            className="group grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] transition-colors duration-[var(--duration-fast)] hover:bg-hover active:bg-pressed"
          >
            <WorkspaceDot
              color={workspace.color}
              active={active}
              className="size-2 opacity-55 transition-[opacity,box-shadow] duration-[var(--duration-fast)] group-hover:opacity-100 data-[active=true]:opacity-100 data-[active=true]:shadow-[0_0_0_2px_var(--chrome),0_0_0_3.5px_var(--dot-color)]"
            />
          </button>
        );
      })}
      <button
        type="button"
        className="icon-button size-7 shrink-0"
        aria-label="New workspace"
        title={withShortcut('New workspace', 'workspace.new')}
        onClick={() => void runCommand('workspace.new')}
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
