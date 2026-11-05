import { useEffect, useRef } from 'react';
import { useShell, type SidebarPanel as Panel } from '../stores/shell-store';
import { BookmarksPanel } from './BookmarksPanel';
import { DownloadsPanel } from './DownloadsPanel';
import { HistoryPanel } from './HistoryPanel';
import { TasksPanel } from './TasksPanel';
import { WorkspaceEditor } from './WorkspaceEditor';

const LABELS: Record<Panel, string> = {
  downloads: 'Downloads',
  history: 'History',
  bookmarks: 'Bookmarks',
  tasks: 'Task Manager',
  workspace: 'Workspace',
};

/**
 * Downloads, History, Bookmarks or the workspace editor, standing in for the trail in
 * the widened sidebar.
 */
export function SidebarPanel({ panel }: { panel: Panel }) {
  const setPanel = useShell((state) => state.setSidebarPanel);
  const editingId = useShell((state) => state.editingWorkspaceId);
  const ref = useRef<HTMLElement>(null);

  // Takes focus so esc goes back, unless a field inside already has it.
  useEffect(() => {
    const section = ref.current;
    if (section && !section.contains(document.activeElement)) section.focus();
  }, [panel]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={LABELS[panel]}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          setPanel(null);
        }
      }}
      className="panel-in flex min-h-0 flex-1 flex-col pr-1 outline-none"
    >
      {panel === 'downloads' ? (
        <DownloadsPanel />
      ) : panel === 'history' ? (
        <HistoryPanel />
      ) : panel === 'bookmarks' ? (
        <BookmarksPanel />
      ) : panel === 'tasks' ? (
        <TasksPanel />
      ) : (
        <WorkspaceEditor key={editingId ?? 'new'} workspaceId={editingId} />
      )}
    </section>
  );
}
