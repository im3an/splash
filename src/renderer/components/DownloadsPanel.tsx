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
import { DownloadRing } from './DownloadRing';
import { PanelHeader } from './PanelHeader';

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

function DownloadRow({
  download,
  index,
}: {
  download: DownloadSummary;
  index: number;
}) {
  const act = (action: DownloadAction) =>
    void api().actOnDownload(download.id, action);
  const failed =
    download.state === 'interrupted' || download.state === 'missing';
  const done = download.state === 'completed';

  return (
    <li
      style={{ '--i': index } as React.CSSProperties}
      className="rise-in group flex items-start gap-2 rounded-[var(--radius-row)] py-2 pr-1.5 pl-2.5 transition-colors duration-[var(--duration-fast)] hover:bg-row-hover"
    >
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
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
          className={`text-small leading-[1.4] ${failed ? 'text-danger' : 'text-fg-subtle'}`}
        >
          {status(download)}
        </p>
        {download.runnable && done && (
          <p className="mt-1 flex items-start gap-1 text-small leading-[1.4] text-fg-muted">
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

  useEffect(() => {
    markSeen();
  }, [markSeen, downloads]);

  const finished = downloads.some(
    (d) => d.state !== 'progressing' && d.state !== 'paused',
  );

  return (
    <>
      <PanelHeader title="Downloads">
        {finished && (
          <button
            type="button"
            onClick={() => void api().clearDownloads()}
            className="h-7 rounded-[var(--radius-control)] px-2 text-small text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-row-hover hover:text-fg"
          >
            Clear finished
          </button>
        )}
        <button
          type="button"
          onClick={() => void api().openDownloadsFolder()}
          aria-label="Open Downloads folder"
          title="Open Downloads folder"
          className="icon-button size-7 shrink-0"
        >
          <FolderOpen size={14} strokeWidth={1.75} />
        </button>
      </PanelHeader>
      {downloads.length === 0 ? (
        <p className="px-3 py-10 text-center text-body text-fg-subtle">
          No downloads yet. Files you download show up here.
        </p>
      ) : (
        <ul className="mt-1.5 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain pb-2">
          {downloads.map((download, index) => (
            <DownloadRow key={download.id} download={download} index={index} />
          ))}
        </ul>
      )}
    </>
  );
}
