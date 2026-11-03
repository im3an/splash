import { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { WorkspaceIcon } from './WorkspaceIcon';

/**
 * The current workspace's name as the heading over its trail, like an Arc
 * space; opens the workspace menu, renames in place.
 */
export function WorkspaceButton() {
  const workspace = useShell((state) =>
    state.snapshot?.workspaces.find(
      (w) => w.id === state.snapshot?.activeWorkspaceId,
    ),
  );
  const renaming = useShell((state) => state.renamingWorkspace);
  const setRenaming = useShell((state) => state.setRenamingWorkspace);
  const settled = useRef(false);

  if (!workspace) return <span className="h-7 shrink-0" />;

  if (renaming) {
    settled.current = false;
    const commit = (value: string) => {
      if (settled.current) return;
      settled.current = true;
      setRenaming(false);
      const name = value.trim();
      if (name && name !== workspace.name) {
        void api().renameWorkspace(workspace.id, name);
      }
    };
    return (
      <input
        autoFocus
        defaultValue={workspace.name}
        aria-label="Workspace name"
        maxLength={80}
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
          if (event.key === 'Escape') {
            settled.current = true;
            setRenaming(false);
          }
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        className="editing-field mb-0.5 h-7 shrink-0 rounded-control pr-2.5 pl-(--lead) text-small font-semibold text-fg select-text"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void api().showWorkspaceMenu()}
      onDoubleClick={() => setRenaming(true)}
      title="Workspaces (⌃1–9 to switch)"
      className="group mb-0.5 flex h-7 max-w-full shrink-0 items-center gap-2 self-start rounded-control pr-1.5 pl-(--lead) text-small font-semibold text-fg-muted transition-colors duration-fast hover:bg-row-hover hover:text-fg"
    >
      <span className="grid size-4 shrink-0 place-items-center text-accent">
        <WorkspaceIcon
          icon={workspace.appearance.icon}
          name={workspace.name}
          size={13}
        />
      </span>
      <span className="truncate">{workspace.name}</span>
      <ChevronDown
        size={12}
        strokeWidth={2}
        className="shrink-0 text-fg-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}
