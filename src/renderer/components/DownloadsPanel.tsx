import { useEffect } from 'react';
import {
  CircleAlert,
  FileDown,
  FolderOpen,
  Pause,
  Play,
  RotateCw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { DownloadAction, DownloadSummary } from '../../shared/types';
import { formatBytes, hostOf } from '../lib/format';
import { api } from '../splash-api';
import { useDownloads } from '../stores/downloads-store';
import { useOverlay } from '../stores/overlay-store';
import { AnchoredPanel } from './AnchoredPanel';
import { DownloadRing } from './DownloadRing';

function status(download: DownloadSummary): string {
  const { receivedBytes: got, totalBytes: total } = download;
  switch (download.state) {
    case 'progressing':
      return total > 0
        ? `${formatBytes(got)} of ${formatBytes(total)}`
        : `${formatBytes(got)} so far`;
    case 'paused':
      return `Paused at ${total > 0 ? `${Math.round((got / total) * 100)}%` : formatBytes(got)}`;
    case 'completed':
      return `${formatBytes(total || got)} · ${hostOf(download.url)}`;
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
    case 'missing':
      return download.problem ?? 'Stopped';
  }
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="icon-button size-6 shrink-0"
    >
      {children}
    </button>
  );
}

function DownloadRow({ download }: { download: DownloadSummary }) {
  const act = (action: DownloadAction) =>
    void api().actOnDownload(download.id, action);
  const failed =
    download.state === 'interrupted' || download.state === 'missing';
  const done = download.state === 'completed';

  return (
    <li className="group flex items-start gap-2.5 rounded-[var(--radius-row)] px-2 py-2 hover:bg-hover">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
        {download.state === 'progressing' ? (
          <DownloadRing
            received={download.receivedBytes}
            total={download.totalBytes}
            size={16}
          />
        ) : failed ? (
          <CircleAlert size={15} strokeWidth={1.75} className="text-danger" />
        ) : (
          <FileDown size={15} strokeWidth={1.75} className="text-fg-subtle" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!done}
          onClick={() => act('open')}
          title={done ? 'Open' : undefined}
          className="block max-w-full truncate text-left text-fg disabled:cursor-default"
        >
          {download.filename}
        </button>
        <p
          className={`text-[12px] leading-[1.4] ${failed ? 'text-danger' : 'text-fg-subtle'}`}
        >
          {status(download)}
        </p>
        {download.runnable && done && (
          <p className="mt-1 flex items-start gap-1 text-[12px] leading-[1.4] text-fg-muted">
            <TriangleAlert
              size={12}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-danger"
            />
            Can run programs on your Mac. Open only if you trust{' '}
            {hostOf(download.url)}.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {download.state === 'progressing' && (
          <>
            <ActionButton label="Pause" onClick={() => act('pause')}>
              <Pause size={13} strokeWidth={2} />
            </ActionButton>
            <ActionButton label="Cancel" onClick={() => act('cancel')}>
              <X size={13} strokeWidth={2} />
            </ActionButton>
          </>
        )}
        {download.state === 'paused' && (
          <ActionButton label="Resume" onClick={() => act('resume')}>
            <Play size={13} strokeWidth={2} />
          </ActionButton>
        )}
        {(failed || download.state === 'cancelled') && (
          <ActionButton label="Retry" onClick={() => act('retry')}>
            <RotateCw size={13} strokeWidth={2} />
          </ActionButton>
        )}
        {done && (
          <ActionButton label="Show in Finder" onClick={() => act('show')}>
            <Search size={13} strokeWidth={2} />
          </ActionButton>
        )}
        {download.state !== 'progressing' && (
          <ActionButton label="Remove from list" onClick={() => act('remove')}>
            <X size={13} strokeWidth={2} />
          </ActionButton>
        )}
      </div>
    </li>
  );
}

/** Every download, newest first, with the actions that fit each one. */
export function DownloadsPanel() {
  const downloads = useDownloads((state) => state.downloads);
  const markSeen = useDownloads((state) => state.markSeen);
  const close = useOverlay((state) => state.close);

  useEffect(() => {
    markSeen();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, markSeen]);

  const finished = downloads.some(
    (d) => d.state !== 'progressing' && d.state !== 'paused',
  );

  return (
    <>
      <div className="absolute inset-0" onMouseDown={close} aria-hidden />
      <AnchoredPanel width={380} label="Downloads" anchor="start">
        <div className="flex items-center justify-between border-b border-divider py-2 pr-2 pl-4">
          <h2 className="font-semibold">Downloads</h2>
          <div className="flex items-center gap-1">
            {finished && (
              <button
                type="button"
                onClick={() => void api().clearDownloads()}
                className="h-7 rounded-[var(--radius-control)] px-2 text-[12px] text-fg-muted hover:bg-hover hover:text-fg"
              >
                Clear finished
              </button>
            )}
            <button
              type="button"
              onClick={() => void api().openDownloadsFolder()}
              aria-label="Open Downloads folder"
              title="Open Downloads folder"
              className="icon-button size-7"
            >
              <FolderOpen size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {downloads.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">
            No downloads yet. Files you download show up here.
          </p>
        ) : (
          <ul className="flex max-h-[min(460px,65vh)] flex-col gap-px overflow-y-auto p-1.5">
            {downloads.map((download) => (
              <DownloadRow key={download.id} download={download} />
            ))}
          </ul>
        )}
      </AnchoredPanel>
    </>
  );
}
