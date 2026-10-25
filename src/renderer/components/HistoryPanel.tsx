import { useEffect, useMemo, useState } from 'react';
import { Globe, Search, X } from 'lucide-react';
import type { HistoryEntry } from '../../shared/types';
import { displayUrl, hostOf } from '../lib/format';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { PanelHeader } from './PanelHeader';

const LIMIT = 300;
const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "Monday", or a date further back. */
export function dayLabel(at: number, now = Date.now()): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (at >= startOfToday) return 'Today';
  if (at >= startOfToday - DAY) return 'Yesterday';
  const date = new Date(at);
  if (at >= startOfToday - 6 * DAY) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The favicon of an open page on the same site; history keeps none. */
function useSiteIcons(): Map<string, string> {
  const pages = useShell((state) => state.snapshot?.pages);
  return useMemo(() => {
    const icons = new Map<string, string>();
    for (const page of Object.values(pages ?? {})) {
      if (page.url && page.faviconUrl) {
        icons.set(hostOf(page.url), page.faviconUrl);
      }
    }
    return icons;
  }, [pages]);
}

function SiteIcon({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <Globe size={14} strokeWidth={1.75} className="text-fg-subtle" />;
  }
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      draggable={false}
      className="size-4 rounded-[var(--radius-mark)] object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/** Every site visited, newest first, grouped by day, searchable. */
export function HistoryPanel() {
  const icons = useSiteIcons();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [removed, setRemoved] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    let current = true;
    // Typing settles before the store is asked.
    const timer = setTimeout(
      () => {
        void api()
          .listHistory(query, LIMIT)
          .then((result) => {
            if (!current) return;
            setEntries(result);
            setSelected(0);
          });
      },
      query ? 120 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  // The panel stays, so several entries can be opened in turn.
  const open = async (entry: HistoryEntry) => {
    await api().createPage(entry.url);
    api().focusPage();
  };

  const remove = (entry: HistoryEntry) => {
    setEntries((list) => list?.filter((e) => e.url !== entry.url) ?? null);
    setRemoved(entry);
    void api().deleteHistoryEntry(entry.url);
  };

  const undo = () => {
    if (!removed) return;
    const entry = removed;
    setRemoved(null);
    void api()
      .restoreHistoryEntry(entry)
      .then(() => api().listHistory(query, LIMIT))
      .then(setEntries);
  };

  const list = entries ?? [];
  const groups: {
    label: string;
    items: { entry: HistoryEntry; index: number }[];
  }[] = [];
  list.forEach((entry, index) => {
    const label = dayLabel(entry.lastVisitedAt);
    const group = groups.at(-1);
    if (group?.label === label) group.items.push({ entry, index });
    else groups.push({ label, items: [{ entry, index }] });
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      // The first press clears the search; the next goes back to the trail.
      if (query) {
        event.preventDefault();
        setQuery('');
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = list[selected];
      if (entry) void open(entry);
    } else if (
      event.key === 'Backspace' &&
      (event.metaKey || event.shiftKey) &&
      list[selected]
    ) {
      event.preventDefault();
      remove(list[selected]);
    }
  };

  useEffect(() => {
    document
      .getElementById(`history-${selected}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <>
      <PanelHeader title="History">
        <button
          type="button"
          onClick={() => void api().openSettings()}
          className="h-7 shrink-0 rounded-[var(--radius-control)] px-2 text-small text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-row-hover hover:text-fg"
        >
          Clear data…
        </button>
      </PanelHeader>
      <div className="mt-1.5 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-field pr-2 pl-2.5 transition-[background-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-within:bg-field-focus focus-within:shadow-[var(--shadow-outline)]">
        <span className="grid size-4 shrink-0 place-items-center text-fg-subtle">
          <Search size={14} strokeWidth={1.75} aria-hidden />
        </span>
        <input
          autoFocus
          value={query}
          maxLength={1000}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search history"
          aria-label="Search history"
          role="combobox"
          aria-expanded={list.length > 0}
          aria-controls="history-results"
          aria-activedescendant={
            list.length > 0 ? `history-${selected}` : undefined
          }
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
        />
      </div>
      {entries === null ? (
        <div className="flex-1" aria-busy="true" />
      ) : list.length === 0 ? (
        <p className="px-3 py-10 text-center text-body text-fg-subtle">
          {query
            ? `Nothing in your history matches “${query.trim()}”.`
            : 'No history yet. Sites you visit show up here.'}
        </p>
      ) : (
        <div
          id="history-results"
          role="listbox"
          aria-label="History"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <h3 className="sticky top-0 z-10 bg-frame px-2.5 pt-3 pb-1 text-caption font-medium text-fg-subtle">
                {group.label}
              </h3>
              <div className="flex flex-col gap-px">
                {group.items.map(({ entry, index }) => (
                  <div
                    key={entry.url}
                    id={`history-${index}`}
                    role="option"
                    aria-selected={index === selected}
                    title={entry.url}
                    onClick={() => void open(entry)}
                    onMouseMove={() => setSelected(index)}
                    data-selected={index === selected}
                    style={{ '--i': index } as React.CSSProperties}
                    className="rise-in group flex cursor-default items-center gap-2 rounded-[var(--radius-row)] py-1.5 pr-1.5 pl-2.5 transition-colors duration-[var(--duration-fast)] data-[selected=true]:bg-row-hover"
                  >
                    <span className="grid size-4 shrink-0 place-items-center">
                      <SiteIcon src={icons.get(hostOf(entry.url))} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fg">
                        {entry.title.trim() || hostOf(entry.url)}
                      </span>
                      <span className="block truncate text-small leading-[1.4] text-fg-subtle">
                        {displayUrl(entry.url)}
                      </span>
                    </span>
                    <span className="shrink-0 pr-1.5 text-caption text-fg-subtle tabular-nums group-data-[selected=true]:hidden">
                      {timeLabel(entry.lastVisitedAt)}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Remove ${entry.title.trim() || hostOf(entry.url)} from history`}
                      title="Remove from history"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(entry);
                      }}
                      className="icon-button hidden size-6 shrink-0 group-data-[selected=true]:grid"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {removed && (
        <div
          role="status"
          className="toast-in mb-2 flex shrink-0 items-center gap-2 rounded-[var(--radius-row)] bg-row-hover py-1.5 pr-1.5 pl-3 text-small text-fg-muted"
        >
          <span className="min-w-0 flex-1 truncate">
            Removed {removed.title.trim() || hostOf(removed.url)}
          </span>
          <button
            type="button"
            onClick={undo}
            className="button px-2 text-small"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
