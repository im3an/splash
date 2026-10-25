import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
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
  const [query, setQuery] = useState(() =>
    scope === 'location'
      ? (selectActivePage(useShell.getState())?.url ?? '')
      : '',
  );
  const [local, setLocal] = useState<PaletteItem[]>([]);
  // The engine's suggestions, which only the location field asks for.
  const [search, setSearch] = useState<PaletteItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(false);
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
    void api()
      .queryPalette(query, scope, complete)
      .then((results) => {
        if (!current) return;
        if (isLocation) offer(results, query);
        setLocal(results);
        setSelected(0);
        setLoaded(true);
      });
    return () => {
      current = false;
    };
  }, [query, scope, complete, isLocation, offer]);

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
  const run = (item: PaletteItem) => void runPaletteItem(item, scope);
  const action = actionOf(items[selected], scope);
  const label =
    scope === 'location'
      ? 'Search or enter address'
      : 'Search pages, workspaces, history and commands';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="absolute inset-0 flex justify-center px-6 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="scrim-in pointer-events-none absolute inset-0 bg-scrim"
        aria-hidden
      />
      <div className="dialog-in relative flex h-fit w-[600px] max-w-full flex-col overflow-hidden rounded-[var(--radius-content)] bg-elevated shadow-[var(--shadow-panel)]">
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
                const item = items[selected];
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
          <kbd className="shrink-0 font-sans text-caption text-fg-subtle">
            esc
          </kbd>
        </div>
        <div id="palette-results">
          <PaletteList
            items={items}
            selected={selected}
            onSelect={setSelected}
            onRun={run}
            query={words}
            sectioned
            emptyLabel={
              loaded && query.trim()
                ? commandsOnly
                  ? `No command matches “${words.trim()}”`
                  : `Nothing matches “${query.trim()}”`
                : null
            }
          />
        </div>
        <div className="flex h-8 items-center gap-3 border-t border-divider px-3.5 text-caption text-fg-subtle">
          <span>
            <kbd className="font-sans">↑↓</kbd> move
          </span>
          {action && (
            <span>
              <kbd className="font-sans">↵</kbd> {action}
            </span>
          )}
          <span className="ml-auto">
            {commandsOnly ? (
              'Commands only'
            ) : (
              <>
                Type <kbd className="font-sans">{COMMAND_PREFIX}</kbd> for
                commands
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
