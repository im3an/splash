import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Signpost, Trash2 } from '../icons';
import type { Preferences } from '../../shared/preferences';
import {
  normalizeShortcut,
  shortcutProblem,
  withoutShortcut,
  type SearchShortcut,
} from '../../shared/search';
import { WAYMARKS_NAME } from '../../shared/waymarks';
import { Button, Section } from './controls';
import { useSettingsNavigation } from './navigation';

type Draft = Pick<SearchShortcut, 'name' | 'keyword' | 'url'>;
const EMPTY: Draft = { name: '', keyword: '', url: '' };

/** The address without its scheme, as the row's quiet second line. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '');

/**
 * The keyword searches: `yt cats` in the address field or the palette goes
 * to that site. Edits save as they're made; a removal offers the way back.
 */
export function SearchShortcuts({
  preferences,
  update,
}: {
  preferences: Preferences;
  update(patch: Partial<Preferences>): void;
}) {
  const shortcuts = preferences.searchShortcuts;
  // `new` for the empty form at the foot of the list, or a row's id.
  const [editing, setEditing] = useState<string | null>(null);
  const go = useSettingsNavigation();
  const [removed, setRemoved] = useState<{
    name: string;
    undo: Partial<Preferences>;
  } | null>(null);

  const save = (id: string | null, draft: Draft) => {
    const tidy = normalizeShortcut(draft);
    update({
      searchShortcuts: id
        ? shortcuts.map((item) =>
            item.id === id ? { ...item, ...tidy } : item,
          )
        : [...shortcuts, { id: crypto.randomUUID(), ...tidy }],
    });
    setRemoved(null);
    setEditing(null);
  };

  const remove = (shortcut: SearchShortcut) => {
    setRemoved({
      name: shortcut.name,
      undo: {
        searchShortcuts: shortcuts,
        searchEngine: preferences.searchEngine,
      },
    });
    update(withoutShortcut(preferences, shortcut.id));
    setEditing(null);
  };

  return (
    <Section
      title="Search shortcuts"
      description="Type a keyword and a space before your search, like “yt cats”, in the address field or the palette."
    >
      {shortcuts.map((shortcut) =>
        editing === shortcut.id ? (
          <ShortcutForm
            key={shortcut.id}
            initial={shortcut}
            others={shortcuts.filter((item) => item.id !== shortcut.id)}
            onSave={(draft) => save(shortcut.id, draft)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div
            key={shortcut.id}
            className="flex min-h-12 items-center gap-3 px-4 py-2.5"
          >
            <kbd className="keycap min-w-7 shrink-0 justify-center font-mono">
              {shortcut.keyword}
            </kbd>
            <div className="min-w-0 flex-1">
              <p className="truncate">{shortcut.name}</p>
              <p
                className="truncate text-small text-fg-subtle"
                title={shortcut.url}
              >
                {bare(shortcut.url)}
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={`Edit ${shortcut.name}`}
              title={`Edit ${shortcut.name}`}
              onClick={() => setEditing(shortcut.id)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${shortcut.name}`}
              title={`Remove ${shortcut.name}`}
              onClick={() => remove(shortcut)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ),
      )}
      {editing === 'new' ? (
        <ShortcutForm
          initial={EMPTY}
          others={shortcuts}
          onSave={(draft) => save(null, draft)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
          {removed ? (
            <p
              role="status"
              className="min-w-0 truncate text-small text-fg-muted"
            >
              Removed {removed.name}.{' '}
              <button
                type="button"
                className="font-medium text-fg underline-offset-2 hover:underline"
                onClick={() => {
                  update(removed.undo);
                  setRemoved(null);
                }}
              >
                Undo
              </button>
            </p>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => go('waymarks')}>
              <Signpost size={13} />
              Browse {WAYMARKS_NAME}
            </Button>
            <Button
              onClick={() => {
                setRemoved(null);
                setEditing('new');
              }}
            >
              <Plus size={13} />
              Add shortcut
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

export function ShortcutForm({
  initial,
  others,
  onSave,
  onCancel,
  checkNow = false,
}: {
  initial: Draft;
  others: readonly SearchShortcut[];
  onSave(draft: Draft): void;
  onCancel(): void;
  /** Say what's wrong straight away, for a form that opens because of it. */
  checkNow?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>({
    name: initial.name,
    keyword: initial.keyword,
    url: initial.url,
  });
  // Problems wait for the first Save, so an empty form isn't scolded.
  const [tried, setTried] = useState(checkNow);
  const problem = shortcutProblem(draft, others);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!problem) onSave(draft);
  };
  const field = (
    key: keyof Draft,
    label: string,
    placeholder: string,
    className: string,
  ) => (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-small text-fg-muted">{label}</span>
      <input
        value={draft[key]}
        placeholder={placeholder}
        autoFocus={key === 'name'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.value }))
        }
        className="h-7 min-w-0 rounded-control bg-field px-2 text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:shadow-focus"
      />
    </label>
  );

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      className="flex flex-col gap-2.5 px-4 py-3"
    >
      <div className="flex gap-2">
        {field('name', 'Name', 'Example', 'flex-1')}
        {field('keyword', 'Keyword', 'ex', 'w-24')}
      </div>
      {field('url', 'Search address', 'example.com/search?q=%s', '')}
      <div className="flex items-center justify-between gap-3">
        <p
          role={tried && problem ? 'alert' : undefined}
          className="min-w-0 text-small leading-copy text-fg-subtle data-[problem=true]:text-danger"
          data-problem={Boolean(tried && problem)}
        >
          {tried && problem ? problem : '%s is where your search words go.'}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" tone="primary">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
