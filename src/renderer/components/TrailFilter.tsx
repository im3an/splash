import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ListFilter, X } from 'lucide-react';
import { filteredRows, pageMatches } from '../lib/trail';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

/**
 * Narrows the trail to matching pages (⌥⌘F). Return opens the first
 * match, Escape clears and closes. The trail below does the narrowing.
 */
export function TrailFilter() {
  const filter = useShell((state) => state.trailFilter);
  const focusRequest = useShell((state) => state.trailFilterFocus);
  const setFilter = useShell((state) => state.setTrailFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filter === null) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    // Only a new request moves focus, not every keystroke.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  if (filter === null) return null;

  const close = () => {
    setFilter(null);
    api().focusPage();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const snapshot = useShell.getState().snapshot;
      if (!snapshot || !filter.trim()) return;
      // The first page that matched itself, not one shown for a match below.
      const match = filteredRows(snapshot, filter).find((row) =>
        pageMatches(snapshot, row.id, filter),
      );
      if (match) void api().activatePage(match.id);
    }
  };

  return (
    <div className="mt-1 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-control bg-field pr-1 pl-2.5 transition-[background-color,box-shadow] duration-base ease-out focus-within:bg-field-focus focus-within:shadow-focus">
      <ListFilter
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-fg-subtle"
      />
      <input
        ref={inputRef}
        value={filter}
        maxLength={200}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Filter pages"
        aria-label="Filter pages"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
      />
      <button
        type="button"
        className="icon-button icon-button-sm shrink-0"
        aria-label="Close filter"
        title="Close filter (esc)"
        onClick={close}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
