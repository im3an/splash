import {
  AppWindow,
  CircleAlert,
  File,
  FileArchive,
  FileText,
  Film,
  Image,
  Music,
  Pause,
  Play,
  RotateCw,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  downloadCategory,
  type DownloadCategory,
} from '../../shared/downloads';
import type { DownloadAction, DownloadSummary } from '../../shared/types';
import {
  formatBytes,
  formatSpeed,
  formatTimeLeft,
  hostOf,
  secondsLeft,
} from '../lib/format';
import { api } from '../splash-api';

const CATEGORY_ICONS: Record<DownloadCategory, LucideIcon> = {
  documents: FileText,
  images: Image,
  video: Film,
  audio: Music,
  archives: FileArchive,
  apps: AppWindow,
  other: File,
};

function progressing(download: DownloadSummary): string {
  const { receivedBytes: got, totalBytes: total, bytesPerSecond } = download;
  const left = secondsLeft(got, total, bytesPerSecond);
  return [
    total > 0
      ? `${formatBytes(got)} of ${formatBytes(total)}`
      : `${formatBytes(got)} so far`,
    bytesPerSecond > 0 ? formatSpeed(bytesPerSecond) : null,
    left !== null ? formatTimeLeft(left) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function status(download: DownloadSummary): string {
  const { receivedBytes: got, totalBytes: total } = download;
  switch (download.state) {
    case 'progressing':
      return progressing(download);
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

/** How far along it is; sweeps when the size isn't known. */
function DownloadBar({ download }: { download: DownloadSummary }) {
  const { receivedBytes: got, totalBytes: total, state } = download;
  const percent =
    total > 0 ? Math.min(100, Math.round((got / total) * 100)) : undefined;
  return (
    <div
      role="progressbar"
      aria-label={`Progress of ${download.filename}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={status(download)}
      className="download-bar"
      data-paused={state === 'paused' || undefined}
      data-sweeping={percent === undefined || undefined}
    >
      <span
        style={percent === undefined ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
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

/**
 * One download with the actions that fit its state, in the Downloads panel
 * and the progress popover. `index` staggers its arrival in a long list.
 */
export function DownloadRow({
  download,
  index,
}: {
  download: DownloadSummary;
  index?: number;
}) {
  const act = (action: DownloadAction) =>
    void api().actOnDownload(download.id, action);
  const failed =
    download.state === 'interrupted' || download.state === 'missing';
  const done = download.state === 'completed';
  const active =
    download.state === 'progressing' || download.state === 'paused';
  const CategoryIcon = CATEGORY_ICONS[downloadCategory(download)];

  return (
    <li
      style={
        index === undefined
          ? undefined
          : ({ '--i': index } as React.CSSProperties)
      }
      className={`group flex items-start gap-2 rounded-row py-2 pr-1.5 pl-2.5 transition-colors duration-fast hover:bg-row-hover ${index === undefined ? '' : 'rise-in'}`}
    >
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
        {failed ? (
          <CircleAlert size={15} className="text-danger" />
        ) : (
          <CategoryIcon size={15} className="text-fg-subtle" />
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
        {active && <DownloadBar download={download} />}
        <p
          className={`text-small leading-copy ${failed ? 'text-danger' : 'text-fg-subtle'}`}
        >
          {status(download)}
        </p>
        {download.runnable && done && (
          <p className="mt-1 flex items-start gap-1 text-small leading-copy text-fg-muted">
            <TriangleAlert size={12} className="mt-0.5 shrink-0 text-danger" />
            Can run programs on your Mac. Open only if you trust{' '}
            {hostOf(download.url)}.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {download.state === 'progressing' && (
          <>
            <ActionButton label="Pause" onClick={() => act('pause')}>
              <Pause size={13} />
            </ActionButton>
            <ActionButton label="Cancel" onClick={() => act('cancel')}>
              <X size={13} />
            </ActionButton>
          </>
        )}
        {download.state === 'paused' && (
          <ActionButton label="Resume" onClick={() => act('resume')}>
            <Play size={13} />
          </ActionButton>
        )}
        {(failed || download.state === 'cancelled') && (
          <ActionButton label="Retry" onClick={() => act('retry')}>
            <RotateCw size={13} />
          </ActionButton>
        )}
        {done && (
          <ActionButton label="Show in Finder" onClick={() => act('show')}>
            <Search size={13} />
          </ActionButton>
        )}
        {download.state !== 'progressing' && (
          <ActionButton label="Remove from list" onClick={() => act('remove')}>
            <X size={13} />
          </ActionButton>
        )}
      </div>
    </li>
  );
}
