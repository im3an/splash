import { Download } from 'lucide-react';
import { useDownloads } from '../stores/downloads-store';
import { useShell } from '../stores/shell-store';
import { DownloadRing } from './DownloadRing';

/**
 * Shows the downloads in the sidebar; shows overall progress while files
 * arrive. Outside the sidebar's foot it only appears once there is one.
 */
export function DownloadsButton({ always = false }: { always?: boolean }) {
  const downloads = useDownloads((state) => state.downloads);
  const unseenProblems = useDownloads((state) => state.unseenProblems);
  const toggle = useShell((state) => state.toggleSidebarPanel);
  const showing = useShell(
    (state) => state.sidebarOpen && state.sidebarPanel === 'downloads',
  );
  const active = downloads.filter((d) => d.state === 'progressing');
  if (downloads.length === 0 && !always) return null;
  const received = active.reduce((sum, d) => sum + d.receivedBytes, 0);
  const total = active.reduce((sum, d) => sum + d.totalBytes, 0);
  const label =
    active.length > 0
      ? `Downloads: ${active.length} in progress`
      : unseenProblems > 0
        ? 'Downloads: a download stopped'
        : 'Downloads (⌥⌘L)';
  return (
    <button
      type="button"
      className="icon-button relative aria-pressed:bg-row-hover aria-pressed:text-fg"
      aria-label={label}
      aria-pressed={showing}
      title={label}
      onClick={() => toggle('downloads')}
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
