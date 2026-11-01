import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { COMMAND_PREFIX, type PaletteScope } from '../../shared/palette';
import type { PaletteItem } from '../../shared/types';
import {
  useInlineCompletion,
  withSearchSuggestions,
} from '../lib/inline-completion';
import { runPaletteItem } from '../lib/run-palette-item';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { PaletteList } from './PaletteList';

/** What Enter does with the selected row, for the footer. */
function actionOf(
  item: PaletteItem | undefined,
  scope: PaletteScope,
): string | null {
  switch (item?.kind) {
    case undefined:
      return null;
    case 'page':
      return item.workspaceName ? `Switch to ${item.workspaceName}` : 'Switch';
    case 'workspace':
      return 'Switch workspace';
    case 'history':
    case 'navigate':
    case 'search':
      return scope === 'location' ? 'Open' : 'Open in new page';
    case 'command':
      return 'Run';
  }
}

/**
 * ⌘K: switch to any page or workspace, open pinned pages and history, run
 * commands. Typing `>` first narrows it to commands.
 *
 * On a blank page it stands in for the hidden address bar (`location`):
 * Enter then goes to the address or search in that page.
 */
export function CommandPalette({ scope }: { scope: PaletteScope }) {
  const close = useOverlay((state) => state.close);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const [query, setQuery] = useState(() =>
    scope === 'location'
      ? (selectActivePage(useShell.getState())?.url ?? '')
      : '',
  );
  const latestTyped = useRef(query);
  const resolvedQuery = useRef<string | null>(null);
  const [local, setLocal] = useState<PaletteItem[]>([]);
  // The engine's suggestions, which only the location field asks for.
  const [search, setSearch] = useState<PaletteItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [queryError, setQueryError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState(false);
  const runningRef = useRef(false);
  const isLocation = scope === 'location';
  const inline = useInlineCompletion(inputRef, query);
  const { offer } = inline;
  const complete = isLocation && inline.forward;
  const commandsOnly = query.trimStart().startsWith(COMMAND_PREFIX);

  const items = useMemo(
    () => (isLocation ? withSearchSuggestions(local, search, 0) : local),
    [isLocation, local, search],
  );
  const pickedId = useRef<string | undefined>(undefined);
  pickedId.current = items[selected]?.id;
  const localRef = useRef(local);
  localRef.current = local;

  useEffect(() => {
    let current = true;
    setQueryError(false);
    setLoaded(false);
    void api()
      .queryPalette(query, scope, complete)
      .then((results) => {
        if (!current) return;
        if (isLocation) offer(results, query);
        resolvedQuery.current = query;
        setLocal(results);
        setSelected(0);
        setLoaded(true);
      })
      .catch(() => {
        if (current) {
          setQueryError(true);
          setLoaded(true);
        }
      });
    return () => {
      current = false;
    };
  }, [query, scope, complete, isLocation, offer, retry]);

  useEffect(() => {
    if (!isLocation || commandsOnly || !query.trim()) {
      setSearch([]);
      return;
    }
    let current = true;
    // Asked once typing pauses for a moment; the last answer stays until
    // the next one replaces it.
    const timer = window.setTimeout(() => {
      void api()
        .suggestSearch(query)
        .then((found) => {
          if (!current) return;
          // A row picked with the arrow keys stays picked as rows move.
          const next = withSearchSuggestions(localRef.current, found, 0);
          const index = next.findIndex((item) => item.id === pickedId.current);
          setSearch(found);
          setSelected(Math.max(0, index));
        })
        .catch(() => {
          if (current) setSearch([]);
        });
    }, 120);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, isLocation, commandsOnly]);

  // An address it opens with is selected, so typing replaces it.
  useEffect(() => inputRef.current?.select(), []);

  const words = commandsOnly
    ? query.trimStart().slice(COMMAND_PREFIX.length)
    : query;
  const run = (item: PaletteItem, typedNavigation = false) => {
    if (runningRef.current || ((!loaded || queryError) && !typedNavigation))
      return;
    runningRef.current = true;
    setRunning(true);
    setActionError(false);
    void runPaletteItem(item, scope)
      .then((success) => setActionError(!success))
      .finally(() => {
        runningRef.current = false;
        setRunning(false);
      });
  };
  const action = actionOf(items[selected], scope);
  const label =
    scope === 'location'
      ? 'Search or enter address'
      : 'Search pages, workspaces, history and commands';

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="absolute inset-0 flex justify-center overflow-y-auto px-4 pt-[min(10vh,64px)] pb-4 outline-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="scrim-in pointer-events-none absolute inset-0 bg-scrim"
        aria-hidden
      />
      <div className="dialog-in relative flex h-fit w-(--palette-width) max-w-full flex-col overflow-hidden rounded-content bg-elevated shadow-panel">
        <div className="flex h-12 items-center gap-2.5 border-b border-divider px-3.5">
          <Search
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-fg-subtle"
            aria-hidden
          />
          <input
            ref={inputRef}
            autoFocus
            value={inline.shown}
            maxLength={8192}
            onChange={(event) => {
              inline.onInput(event);
              latestTyped.current = event.target.value;
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                // The first press takes back a filled-in address.
                if (inline.active) inline.clear();
                else close();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((index) => (index + 1) % Math.max(1, items.length));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected(
                  (index) =>
                    (index - 1 + items.length) % Math.max(1, items.length),
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const typed = latestTyped.current.trim();
                const item = items[selected];
                // Enter must never navigate a result from the preceding
                // keystroke while the latest result request is still pending.
                if (
                  isLocation &&
                  typed &&
                  !typed.startsWith(COMMAND_PREFIX) &&
                  (!loaded ||
                    queryError ||
                    resolvedQuery.current !== latestTyped.current ||
                    item?.id === 'navigate')
                ) {
                  return run(
                    {
                      id: 'typed',
                      kind: 'navigate',
                      input: typed,
                      title: typed,
                      subtitle: '',
                      section: 'go',
                    },
                    true,
                  );
                }
                // A completion just typed past goes where the text says.
                if (item?.id === 'complete' && !inline.active) {
                  const typedOut = items.find((i) => i.id === 'navigate');
                  if (typedOut) return run(typedOut);
                }
                if (item) run(item);
              }
            }}
            placeholder={commandsOnly ? 'Run a command' : label}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-results"
            aria-activedescendant={
              items.length > 0 ? `palette-${selected}` : undefined
            }
            aria-label={label}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-lead text-fg outline-none placeholder:text-fg-subtle select-text"
          />
          <button
            type="button"
            onClick={close}
            className="keycap shrink-0 hover:bg-pressed"
            aria-label="Close command palette"
            title="Close (esc)"
          >
            esc
          </button>
        </div>
        <div id="palette-results" aria-busy={!loaded || running}>
          {!loaded && (
            <p className="px-3.5 py-3 text-small text-fg-muted" role="status">
              Searching your pages and history…
            </p>
          )}
          {running && (
            <p className="px-3.5 py-2 text-small text-fg-muted" role="status">
              Opening…
            </p>
          )}
          {queryError && (
            <div
              className="flex items-center justify-between gap-3 px-3.5 py-3 text-small"
              role="alert"
            >
              <span>Couldn’t load results. Your search is kept.</span>
              <button
                type="button"
                className="button button-raised"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {actionError && (
            <p role="alert" className="px-3.5 py-2 text-small text-danger">
              That action failed. Choose it again to retry.
            </p>
          )}
          <PaletteList
            items={queryError ? [] : items}
            selected={selected}
            onSelect={setSelected}
            onRun={run}
            query={words}
            sectioned
            emptyLabel={
              loaded && !queryError && query.trim()
                ? commandsOnly
                  ? words.trim()
                    ? `No command matches “${words.trim()}”`
                    : 'No commands apply here'
                  : `Nothing matches “${query.trim()}”`
                : null
            }
            emptyHint={
              commandsOnly
                ? `Delete “${COMMAND_PREFIX}” to search pages and history too.`
                : 'Try fewer words, or part of an address.'
            }
          />
        </div>
        <div className="flex h-9 items-center gap-4 border-t border-divider px-3.5 text-caption text-fg-subtle">
          {items.length > 1 && (
            <span className="flex items-center gap-1.5">
              <kbd className="keycap" aria-label="Up and down arrows">
                ↑↓
              </kbd>
              Move
            </span>
          )}
          {action && (
            <span className="flex min-w-0 items-center gap-1.5">
              <kbd className="keycap" aria-label="Return">
                ↵
              </kbd>
              <span className="truncate">{action}</span>
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {commandsOnly ? (
              'Commands only'
            ) : (
              <>
                Type <kbd className="keycap">{COMMAND_PREFIX}</kbd> for commands
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
