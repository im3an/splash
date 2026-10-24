import { useLayoutEffect, useRef } from 'react';
import { Download, PanelLeft, Plus } from 'lucide-react';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { TrailTree } from './TrailTree';
import { UndoToast } from './UndoToast';
import { WorkspaceBar } from './WorkspaceBar';
import { WorkspaceButton } from './WorkspaceButton';
import { DownloadRing } from './DownloadRing';
import { useDownloads } from '../stores/downloads-store';
import { useOverlay } from '../stores/overlay-store';

export function Sidebar() {
  const open = useShell((state) => state.sidebarOpen);
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  const focusAddressBar = useShell((state) => state.focusAddressBar);
  const workspaceId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const listRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef(new Map<string, number>());

  // Each workspace keeps its own scroll position in the trail.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !workspaceId) return;
    list.scrollTop = scrollPositions.current.get(workspaceId) ?? 0;
    const positions = scrollPositions.current;
    return () => {
      positions.set(workspaceId, list.scrollTop);
    };
  }, [workspaceId]);

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
          <DownloadsButton />
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
          className="mb-1 flex h-[var(--row-height)] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-2 pl-6 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
        >
          <Plus size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">New page</span>
          <kbd className="font-sans text-[11px] text-fg-subtle">⌘T</kbd>
        </button>

        <div className="mx-2 mb-1 h-px shrink-0 bg-divider" />

        <nav
          ref={listRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-2"
        >
          <TrailTree />
        </nav>
        <UndoToast />
        <WorkspaceBar />
      </div>
    </aside>
  );
}

/** Opens the downloads list; shows overall progress while files arrive. */
function DownloadsButton() {
  const downloads = useDownloads((state) => state.downloads);
  const unseenProblems = useDownloads((state) => state.unseenProblems);
  const open = useOverlay((state) => state.open);
  const active = downloads.filter((d) => d.state === 'progressing');
  if (downloads.length === 0) return null;
  const received = active.reduce((sum, d) => sum + d.receivedBytes, 0);
  const total = active.reduce((sum, d) => sum + d.totalBytes, 0);
  const label =
    active.length > 0
      ? `Downloads: ${active.length} in progress`
      : unseenProblems > 0
        ? 'Downloads: a download stopped'
        : 'Downloads';
  return (
    <button
      type="button"
      className="icon-button relative"
      aria-label={label}
      title={label}
      onClick={() => void open({ kind: 'downloads' })}
    >
      {active.length > 0 ? (
        <DownloadRing received={received} total={total} size={16} />
      ) : (
        <Download size={15} strokeWidth={1.75} />
      )}
      {unseenProblems > 0 && (
        <span
          className="absolute top-1 right-1 size-1.5 rounded-full bg-danger"
          aria-hidden
        />
      )}
    </button>
  );
}
