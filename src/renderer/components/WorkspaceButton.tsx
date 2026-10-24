import { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

/** The current workspace's name; opens the workspace menu, renames in place. */
export function WorkspaceButton() {
  const workspace = useShell((state) =>
    state.snapshot?.workspaces.find(
      (w) => w.id === state.snapshot?.activeWorkspaceId,
    ),
  );
  const renaming = useShell((state) => state.renamingWorkspace);
  const setRenaming = useShell((state) => state.setRenamingWorkspace);
  const settled = useRef(false);

  if (!workspace) return <span className="min-w-0 flex-1" />;

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
        className="h-7 min-w-0 flex-1 rounded-[var(--radius-control)] bg-field-focus px-2 text-[13px] font-medium text-fg shadow-[0_0_0_1px_var(--hairline),0_0_0_3px_var(--accent-soft)] outline-none select-text"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void api().showWorkspaceMenu()}
      onDoubleClick={() => setRenaming(true)}
      title="Workspaces (⌃1–9 to switch)"
      className="flex h-7 min-w-0 items-center gap-1 rounded-[var(--radius-control)] px-2 font-medium text-fg transition-colors duration-[var(--duration-fast)] hover:bg-hover"
    >
      <span className="truncate">{workspace.name}</span>
      <ChevronDown
        size={12}
        strokeWidth={2}
        className="shrink-0 text-fg-subtle"
      />
    </button>
  );
}
