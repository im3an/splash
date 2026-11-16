import { ArrowDownToLine } from '../icons';
import { isActiveDownload } from '../../shared/downloads';
import { useDownloads } from '../stores/downloads-store';
import { useOverlay } from '../stores/overlay-store';
import { useShell } from '../stores/shell-store';
import { DownloadRing } from './DownloadRing';
import { DOWNLOADS_BUTTON_ID } from './DownloadsPopover';

/**
 * Overall progress, and the way into the progress popover. Unless it's pinned
 * to the toolbar (`always`), it comes up when a download needs following or
 * hasn't been seen, and stays while the sidebar that lists them is hidden.
 */
export function DownloadsButton({ always = false }: { always?: boolean }) {
  const downloads = useDownloads((state) => state.downloads);
  const unseenProblems = useDownloads((state) => state.unseenProblems);
  const unseenFinished = useDownloads((state) => state.unseenFinished);
  const togglePanel = useShell((state) => state.toggleSidebarPanel);
  const sidebarOpen = useShell((state) => state.sidebarOpen);
  const showingPanel = useShell(
    (state) => state.sidebarOpen && state.sidebarPanel === 'downloads',
  );
  const expanded = useOverlay(
    (state) => state.overlay?.kind === 'downloads' && !state.leaving,
  );
  const running = downloads.filter((d) => d.state === 'progressing');
  const paused = downloads.filter((d) => d.state === 'paused');
  const needsFollowing =
    downloads.some(isActiveDownload) ||
    unseenProblems > 0 ||
    unseenFinished > 0;
  // Its own popover marks everything seen; it stays put while that's open.
  if (
    !always &&
    !expanded &&
    !needsFollowing &&
    (sidebarOpen || downloads.length === 0)
  ) {
    return null;
  }
  const received = running.reduce((sum, d) => sum + d.receivedBytes, 0);
  const total = running.reduce((sum, d) => sum + d.totalBytes, 0);
  const label =
    running.length > 0
      ? `Downloads: ${running.length} in progress`
      : paused.length > 0
        ? `Downloads: ${paused.length} paused`
        : unseenProblems > 0
          ? 'Downloads: a download stopped'
          : unseenFinished > 0
            ? 'Downloads: finished'
            : 'Downloads';
  return (
    <button
      id={DOWNLOADS_BUTTON_ID}
      type="button"
      className="icon-button relative aria-expanded:bg-row-hover aria-expanded:text-fg aria-pressed:bg-row-hover aria-pressed:text-fg"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-pressed={showingPanel}
      title={label}
      onClick={() => {
        // The whole list is already on screen; the button puts it away.
        if (showingPanel) return togglePanel('downloads');
        const overlay = useOverlay.getState();
        if (expanded) return overlay.close();
        overlay
          .open({ kind: 'downloads' })
          .catch(() => togglePanel('downloads'));
      }}
    >
      {running.length > 0 ? (
        <DownloadRing received={received} total={total} size={16} />
      ) : (
        <ArrowDownToLine size={16} />
      )}
      {(unseenProblems > 0 || unseenFinished > 0) && (
        <span
          className={`absolute top-1 right-1 size-1.5 rounded-full ${unseenProblems > 0 ? 'bg-danger' : 'bg-accent'}`}
          aria-hidden
        />
      )}
    </button>
  );
}
