import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import {
  MAX_SEARCH_SHORTCUTS,
  normalizeShortcut,
  withoutShortcut,
} from '../../shared/search';
import {
  findWaymarks,
  WAYMARK_CATEGORIES,
  WAYMARKS,
  WAYMARKS_NAME,
  type Waymark,
  type WaymarkCategory,
} from '../../shared/waymarks';
import { Button, Section, Select } from './controls';
import { useSettingsNavigation } from './navigation';
import { ShortcutForm } from './SearchShortcuts';
import { usePreferences } from './sections';

const host = (waymark: Waymark) =>
  new URL(waymark.url.replace('%s', 'x')).hostname.replace(/^www\./, '');

/**
 * The store of search shortcuts: find a site, add it, type its keyword. A row
 * added by mistake is taken off by the same button, so there's nothing to undo.
 */
export function WaymarksSettings() {
  const [preferences, update] = usePreferences();
  const go = useSettingsNavigation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WaymarkCategory | null>(null);
  // The row whose keyword is taken, asking for another one.
  const [clashing, setClashing] = useState<string | null>(null);

  const found = useMemo(() => findWaymarks(query, category), [query, category]);
  if (!preferences) return null;
  const shortcuts = preferences.searchShortcuts;
  const full = shortcuts.length >= MAX_SEARCH_SHORTCUTS;
  const added = (waymark: Waymark) =>
    shortcuts.find((item) => item.url === waymark.url);

  const save = (draft: { name: string; keyword: string; url: string }) => {
    update({
      searchShortcuts: [
        ...shortcuts,
        { id: crypto.randomUUID(), ...normalizeShortcut(draft) },
      ],
    });
    setClashing(null);
  };
  const add = (waymark: Waymark) => {
    if (shortcuts.some((item) => item.keyword === waymark.keyword)) {
      setClashing(waymark.keyword);
    } else {
      save(waymark);
    }
  };

  return (
    <>
      <p className="-mt-4 leading-copy text-fg-muted">
        The signs along your trail. Add a site, then type its keyword and a
        space to search it, like “imdb dune”, in the address field or the
        palette. This list is part of Splash, so browsing it sends nothing
        anywhere.
      </p>
      <div className="sticky top-0 z-10 -my-3 flex items-center gap-2 bg-surface py-3">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control bg-field px-2 focus-within:shadow-focus">
          <Search size={13} className="shrink-0 text-fg-subtle" />
          <input
            type="search"
            aria-label={`Search ${WAYMARKS_NAME}`}
            value={query}
            placeholder={`Search ${WAYMARKS.length} sites`}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-small text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
        <Select
          aria-label="Category"
          value={category ?? ''}
          onChange={(event) =>
            setCategory((event.target.value || null) as WaymarkCategory | null)
          }
        >
          <option value="">All categories</option>
          {WAYMARK_CATEGORIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      {found.length === 0 && (
        <p role="status" className="leading-copy text-fg-muted">
          Nothing here matches that. Any site with a search can still be added
          by hand.{' '}
          <button
            type="button"
            className="font-medium text-fg underline-offset-2 hover:underline"
            onClick={() => go('general')}
          >
            Go to Search shortcuts
          </button>
        </p>
      )}
      {WAYMARK_CATEGORIES.map((name) => {
        const rows = found.filter((waymark) => waymark.category === name);
        if (rows.length === 0) return null;
        return (
          <Section key={name} title={name}>
            {rows.map((waymark) => {
              const shortcut = added(waymark);
              return clashing === waymark.keyword ? (
                <ShortcutForm
                  key={waymark.url}
                  initial={waymark}
                  others={shortcuts}
                  checkNow
                  onSave={save}
                  onCancel={() => setClashing(null)}
                />
              ) : (
                <div
                  key={waymark.url}
                  className="flex min-h-12 items-center gap-3 px-4 py-2.5"
                >
                  {/* A fixed column, so a long list's names line up. */}
                  <span className="w-[4.5rem] shrink-0">
                    <kbd className="keycap min-w-7 justify-center font-mono">
                      {shortcut?.keyword ?? waymark.keyword}
                    </kbd>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{waymark.name}</p>
                    <p className="truncate text-small text-fg-subtle">
                      {host(waymark)}
                    </p>
                  </div>
                  {shortcut ? (
                    <button
                      type="button"
                      aria-label={`Remove ${waymark.name}`}
                      title={`Remove ${waymark.name}`}
                      onClick={() =>
                        update(withoutShortcut(preferences, shortcut.id))
                      }
                      className="button button-raised text-small font-medium"
                    >
                      <Check size={13} />
                      Added
                    </button>
                  ) : (
                    <Button
                      aria-label={`Add ${waymark.name}`}
                      disabled={full}
                      onClick={() => add(waymark)}
                    >
                      <Plus size={13} />
                      Add
                    </Button>
                  )}
                </div>
              );
            })}
          </Section>
        );
      })}
    </>
  );
}
