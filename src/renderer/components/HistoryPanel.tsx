import { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { useHistoryView } from '../stores/history-view-store';
import { CircleAlert, History, Search, X } from 'lucide-react';
import type { HistoryEntry } from '../../shared/types';
import { displayUrl, hostOf } from '../lib/format';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { PanelHeader } from './PanelHeader';
import { PanelState } from './PanelState';
import { SiteIcon } from './Favicon';

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

/** Reuse known site icons for older visits that did not record one. */
function useSiteIcons(entries: HistoryEntry[] | null): Map<string, string> {
  const pages = useShell((state) => state.snapshot?.pages);
  return useMemo(() => {
    const icons = new Map<string, string>();
    for (const entry of entries ?? []) {
      if (entry.faviconUrl && !icons.has(hostOf(entry.url))) {
        icons.set(hostOf(entry.url), entry.faviconUrl);
      }
    }
    for (const page of Object.values(pages ?? {})) {
      if (page.url && page.faviconUrl) {
        icons.set(hostOf(page.url), page.faviconUrl);
      }
    }
    return icons;
  }, [pages, entries]);
}

/** Every site visited, newest first, grouped by day, searchable. */
export function HistoryPanel() {
  const query = useHistoryView((state) => state.query);
  const selected = useHistoryView((state) => state.selected);
  const removed = useHistoryView((state) => state.removed);
  const listRef = useRef<HTMLDivElement>(null);
  const setQuery = (query: string) =>
    useHistoryView.setState({ query, selected: 0, scrollTop: 0 });
  const setSelected = (update: number | ((previous: number) => number)) =>
    useHistoryView.setState((state) => ({
      selected: typeof update === 'function' ? update(state.selected) : update,
    }));
  const setRemoved = (removed: HistoryEntry | null) =>
    useHistoryView.setState({ removed });
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const icons = useSiteIcons(entries);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    if (listRef.current && !loading)
      listRef.current.scrollTop = useHistoryView.getState().scrollTop;
  }, [loading]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(false);
    // Typing settles before the store is asked.
    const timer = setTimeout(
      () => {
        void api()
          .listHistory(query, LIMIT)
          .then((result) => {
            if (!current) return;
            setEntries(result);
            setSelected((index) =>
              Math.min(index, Math.max(0, result.length - 1)),
            );
            setLoading(false);
          })
          .catch(() => {
            if (current) {
              setLoadError(true);
              setLoading(false);
            }
          });
      },
      query ? 120 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, retry]);

  // The panel stays, so several entries can be opened in turn.
  const open = async (entry: HistoryEntry) => {
    if (loading) return;
    setActionError(null);
    try {
      await api().createPage(entry.url);
      api().focusPage();
    } catch {
      setActionError('Couldn’t open this page. Try again.');
    }
  };

  const remove = async (entry: HistoryEntry) => {
    if (busy || loading) return;
    setBusy(true);
    setActionError(null);
    try {
      await api().deleteHistoryEntry(entry.url);
      setEntries((list) => list?.filter((e) => e.url !== entry.url) ?? null);
      setSelected((index) => Math.max(0, index - 1));
      setRemoved(entry);
    } catch {
      setActionError(
        'Couldn’t remove this entry. It is still in your history. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!removed || busy) return;
    const entry = removed;
    setBusy(true);
    setActionError(null);
    try {
      await api().restoreHistoryEntry(entry);
      setRemoved(null);
      setRetry((value) => value + 1);
    } catch {
      setActionError('Couldn’t restore this entry. Try Undo again.');
    } finally {
      setBusy(false);
    }
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
      setSelected((index) => Math.max(0, Math.min(index + 1, list.length - 1)));
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
      void remove(list[selected]);
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
          className="button button-sm shrink-0"
        >
          Clear data…
        </button>
      </PanelHeader>
      <div className="mt-1.5 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-control bg-field pr-1 pl-2.5 transition-[background-color,box-shadow] duration-base ease-out focus-within:bg-field-focus focus-within:shadow-focus">
        <span className="grid size-4 shrink-0 place-items-center text-fg-subtle">
          {loading ? (
            <span
              className="spinner"
              role="status"
              aria-label="Searching history"
            />
          ) : (
            <Search size={14} strokeWidth={1.75} aria-hidden />
          )}
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
            !loading && list.length > 0 ? `history-${selected}` : undefined
          }
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
        />
        {query && (
          <button
            type="button"
            className="icon-button size-6 shrink-0"
            aria-label="Clear history search"
            title="Clear search (esc)"
            onClick={() => setQuery('')}
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      {loadError ? (
        <PanelState
          icon={CircleAlert}
          title="Couldn’t load history"
          detail="Your history hasn’t been changed. Try loading it again."
          action="Try again"
          onAction={() => setRetry((value) => value + 1)}
          error
        />
      ) : entries === null || (loading && list.length === 0) ? (
        <div
          className="flex-1 space-y-4 px-2.5 py-4"
          role="status"
          aria-label="Loading history"
          aria-busy="true"
        >
          {[0, 1, 2, 3].map((row) => (
            <div key={row} aria-hidden className="flex items-center gap-2.5">
              <span className="skeleton size-4 shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="skeleton h-3 w-3/4" />
                <span className="skeleton h-2 w-1/2" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading history…</span>
        </div>
      ) : list.length === 0 ? (
        <PanelState
          icon={query ? Search : History}
          title={query ? 'No matching pages' : 'Pick up where you left off'}
          detail={
            query
              ? `Nothing matches “${query.trim()}”. Try a different word or part of an address.`
              : 'Sites you visit appear here, ready to find and open again.'
          }
          action={query ? 'Clear search' : undefined}
          onAction={() => setQuery('')}
        />
      ) : (
        <div
          ref={listRef}
          onScroll={(event) =>
            useHistoryView.setState({
              scrollTop: event.currentTarget.scrollTop,
            })
          }
          id="history-results"
          role="listbox"
          aria-label="History"
          aria-busy={loading}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 ${loading ? 'pointer-events-none opacity-60' : ''}`}
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
                    className="group relative flex cursor-default items-center gap-2 rounded-row py-1.5 pr-1.5 pl-2.5 transition-colors duration-fast data-[selected=true]:bg-row-hover"
                  >
                    <span className="grid size-4 shrink-0 place-items-center">
                      <SiteIcon
                        url={entry.faviconUrl ?? icons.get(hostOf(entry.url))}
                        site={entry.url}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fg">
                        {entry.title.trim() || hostOf(entry.url)}
                      </span>
                      <span className="block truncate text-small leading-copy text-fg-subtle">
                        {displayUrl(entry.url)}
                      </span>
                    </span>
                    <span className="shrink-0 pr-1.5 text-caption text-fg-subtle tabular-nums group-data-[selected=true]:invisible">
                      {timeLabel(entry.lastVisitedAt)}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Remove ${entry.title.trim() || hostOf(entry.url)} from history`}
                      title="Remove from history"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void remove(entry);
                      }}
                      className="icon-button absolute right-1.5 hidden size-6 shrink-0 group-data-[selected=true]:grid"
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
      {actionError && (
        <p
          role="alert"
          className="px-3 py-2 text-small leading-relaxed text-danger"
        >
          {actionError}
        </p>
      )}
      {removed && (
        <div
          role="status"
          className="toast-in mb-2 flex shrink-0 items-center gap-2 rounded-row bg-row-hover py-1.5 pr-1.5 pl-3 text-small text-fg-muted"
        >
          <span className="min-w-0 flex-1 truncate">
            Removed {removed.title.trim() || hostOf(removed.url)}
          </span>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={busy}
            className="button px-2 text-small"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
