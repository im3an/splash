import { useRef } from 'react';
import { ChevronDown } from '../icons';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

/**
 * The current workspace's name, centred in the sidebar's foot; opens the workspace menu, renames in place.
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

  if (!workspace) return <span className="h-6 shrink-0" />;

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
        className="editing-field h-6 w-40 max-w-full shrink-0 rounded-control px-2 text-center text-small font-semibold text-fg select-text"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void api().showWorkspaceMenu()}
      onDoubleClick={() => setRenaming(true)}
      title="Workspaces (⌃1–9 to switch)"
      className="flex h-6 max-w-full shrink-0 items-center gap-0.5 rounded-control pr-1.5 pl-2 text-small font-semibold text-fg-muted transition-colors duration-fast hover:bg-row-hover hover:text-fg"
    >
      <span className="min-w-0 truncate">{workspace.name}</span>
      <ChevronDown size={12} aria-hidden className="shrink-0 text-fg-subtle" />
    </button>
  );
}
