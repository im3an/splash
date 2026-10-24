import { PanelLeft, Plus } from 'lucide-react';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { TrailTree } from './TrailTree';
import { UndoToast } from './UndoToast';
import { WorkspaceButton } from './WorkspaceButton';

export function Sidebar() {
  const open = useShell((state) => state.sidebarOpen);
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  const focusAddressBar = useShell((state) => state.focusAddressBar);

  const newPage = async () => {
    await api().createPage();
    focusAddressBar();
  };

  return (
    <aside
      aria-label="Sidebar"
      aria-hidden={!open}
      inert={!open}
      className="shrink-0 overflow-hidden transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]"
      style={{ width: open ? 'var(--sidebar-width)' : 0 }}
    >
      <div className="flex h-full w-[var(--sidebar-width)] flex-col pl-2">
        <div className="drag flex h-[var(--toolbar-height)] shrink-0 items-center gap-1 pr-1 pl-[calc(var(--traffic-lights)-8px)]">
          <WorkspaceButton />
          <span className="flex-1" />
          <button
            type="button"
            className="icon-button"
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘S)"
            onClick={toggleSidebar}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        </div>

        <button
          type="button"
          onClick={newPage}
          className="mb-1 flex h-[30px] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-2 pl-6 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
        >
          <Plus size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">New page</span>
          <kbd className="font-sans text-[11px] text-fg-subtle">⌘T</kbd>
        </button>

        <div className="mx-2 mb-1 h-px shrink-0 bg-divider" />

        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-2">
          <TrailTree />
        </nav>
        <UndoToast />
      </div>
    </aside>
  );
}
