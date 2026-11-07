import { useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import {
  DOWNLOAD_CATEGORIES,
  downloadCategory,
  downloadCategoryLabels,
  isActiveDownload,
  type DownloadCategory,
} from '../../shared/downloads';
import { api } from '../splash-api';
import { useDownloads } from '../stores/downloads-store';
import { DownloadRow } from './DownloadRow';
import { PanelHeader } from './PanelHeader';
import { PanelState } from './PanelState';

type Filter = DownloadCategory | 'all';

function CategoryChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-6 items-center gap-1 rounded-control px-2 text-small transition-colors duration-fast hover:bg-row-hover ${selected ? 'bg-row-hover text-fg' : 'text-fg-muted'}`}
    >
      {label}
      <span className="text-fg-subtle tabular-nums">{count}</span>
    </button>
  );
}

/** Every download, newest first, narrowed to one kind of file if asked. */
export function DownloadsPanel() {
  const downloads = useDownloads((state) => state.downloads);
  const markSeen = useDownloads((state) => state.markSeen);
  const [chosen, setChosen] = useState<Filter>('all');

  useEffect(() => {
    markSeen();
  }, [markSeen, downloads]);

  const counts = useMemo(() => {
    const tally = new Map<DownloadCategory, number>();
    for (const download of downloads) {
      const category = downloadCategory(download);
      tally.set(category, (tally.get(category) ?? 0) + 1);
    }
    return tally;
  }, [downloads]);
  const present = DOWNLOAD_CATEGORIES.filter((category) =>
    counts.has(category),
  );

  // Back to All for good once the chips go or the chosen kind empties, so a
  // later download isn't hidden behind a filter nobody can see.
  const filter: Filter =
    chosen !== 'all' && present.length > 1 && present.includes(chosen)
      ? chosen
      : 'all';
  if (filter !== chosen) setChosen(filter);

  const visible =
    filter === 'all'
      ? downloads
      : downloads.filter((d) => downloadCategory(d) === filter);
  const finished = visible.filter((d) => !isActiveDownload(d));

  const clearFinished = () => {
    if (filter === 'all') return void api().clearDownloads();
    for (const download of finished) {
      void api().actOnDownload(download.id, 'remove');
    }
  };

  return (
    <>
      <PanelHeader title="Downloads">
        {finished.length > 0 && (
          <button
            type="button"
            onClick={clearFinished}
            className="button button-sm"
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
          <FolderOpen size={14} />
        </button>
      </PanelHeader>
      {present.length > 1 && (
        <div
          role="group"
          aria-label="Show downloads of one kind"
          className="mt-1 flex shrink-0 flex-wrap gap-0.5 pl-1"
        >
          <CategoryChip
            label="All"
            count={downloads.length}
            selected={filter === 'all'}
            onClick={() => setChosen('all')}
          />
          {present.map((category) => (
            <CategoryChip
              key={category}
              label={downloadCategoryLabels[category]}
              count={counts.get(category) ?? 0}
              selected={filter === category}
              onClick={() => setChosen(category)}
            />
          ))}
        </div>
      )}
      {downloads.length === 0 ? (
        <PanelState
          icon={Download}
          title="Your downloads, in one place"
          detail="Files you download appear here. Follow their progress, open them or find them in Finder."
        />
      ) : (
        <ul className="mt-1.5 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain pb-2">
          {visible.map((download, index) => (
            <DownloadRow key={download.id} download={download} index={index} />
          ))}
        </ul>
      )}
    </>
  );
}
