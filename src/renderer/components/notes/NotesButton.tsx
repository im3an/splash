import { useEffect, useMemo } from 'react';
import { noteTitle, notesForSite, siteKey } from '../../../shared/notes';
import { pageParts } from '../../lib/format';
import { useOverlay } from '../../stores/overlay-store';
import { openNotes, useNotes } from '../../stores/notes-store';
import { selectActivePage, useShell } from '../../stores/shell-store';
import { NotesMark } from './NotesMark';

/**
 * Notes, from the toolbar. On a site you have notes for, the mark takes the
 * accent colour and a count, so a page you wrote about says so at a glance.
 */
export function NotesButton() {
  const page = useShell(selectActivePage);
  const notes = useNotes((state) => state.notes);
  const open = useOverlay((state) => state.overlay?.kind === 'notes');
  useNotesSync();
  const key = siteKey(page?.url);
  const here = useMemo(() => notesForSite(notes, key), [notes, key]);
  const label = here.length
    ? here.length === 1
      ? `Note for ${key}: ${noteTitle(here[0]?.body ?? '')} (⌥⌘N)`
      : `${here.length} notes for ${key} (⌥⌘N)`
    : key
      ? `New note for ${key} (⌥⌘N)`
      : 'Notes (⌥⌘N)';
  return (
    <button
      type="button"
      className="icon-button relative data-[here=true]:text-accent"
      aria-label={label}
      aria-pressed={open}
      data-here={here.length > 0}
      title={label}
      onClick={() => {
        if (open) return useOverlay.getState().close();
        void openNotes(
          page?.url && key
            ? { key, url: page.url, title: pageParts(page).title || key }
            : null,
        );
      }}
    >
      <NotesMark size={16} />
      {here.length > 0 && (
        <span
          aria-hidden
          className="absolute -top-px -right-px grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[length:var(--type-caption)] leading-none font-semibold text-on-accent"
        >
          {here.length}
        </span>
      )}
    </button>
  );
}

/**
 * Reads notes on start and whenever the window comes forward, so notes
 * written in another window show here too.
 */
export function useNotesSync() {
  useEffect(() => {
    const load = () =>
      void useNotes
        .getState()
        .flush()
        .then(() => useNotes.getState().load())
        .catch(() => undefined);
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
}
