import { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
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
      className="group relative flex h-6 max-w-full shrink-0 items-center justify-center rounded-control px-5 text-small font-semibold text-fg-muted transition-colors duration-fast hover:bg-row-hover hover:text-fg"
    >
      <span className="min-w-0">
        <span className="block truncate">{workspace.name}</span>
      </span>
      <ChevronDown
        size={12}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-fg-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}
