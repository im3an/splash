import { create } from 'zustand';
import { notesForSite, type Note } from '../../shared/notes';
import { api } from '../splash-api';
import { useOverlay } from './overlay-store';

/** How long typing pauses before a note is written to disk. */
const SAVE_DELAY_MS = 500;

interface NotesState {
  notes: Note[];
  loaded: boolean;
  activeId: string | null;
  load(): Promise<void>;
  select(id: string | null): void;
  create(body?: string, sites?: string[]): Note;
  edit(id: string, patch: Partial<Pick<Note, 'body' | 'sites'>>): void;
  remove(id: string): void;
  /** Puts a deleted note back, same id and text. */
  restore(note: Note): void;
  /** Writes any edit still waiting. */
  flush(): Promise<void>;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

function persist(note: Note) {
  clearTimeout(pending.get(note.id));
  pending.delete(note.id);
  return api()
    .saveNote({ id: note.id, body: note.body, sites: note.sites })
    .catch(() => undefined);
}

export const useNotes = create<NotesState>()((set, get) => ({
  notes: [],
  loaded: false,
  activeId: null,
  load: async () => {
    const notes = await api().listNotes();
    // Edits still waiting to be written win over the file.
    const local = new Map(
      get()
        .notes.filter((note) => pending.has(note.id))
        .map((note) => [note.id, note]),
    );
    const listed = notes.map((note) => local.get(note.id) ?? note);
    const unsaved = [...local.values()].filter(
      (note) => !notes.some((item) => item.id === note.id),
    );
    set({ notes: [...unsaved, ...listed], loaded: true });
  },
  select: (id) => set({ activeId: id }),
  create: (body = '', sites = []) => {
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      body,
      sites,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ notes: [note, ...state.notes], activeId: note.id }));
    void persist(note);
    return note;
  },
  edit: (id, patch) => {
    let changed: Note | undefined;
    set((state) => ({
      notes: state.notes.map((note) => {
        if (note.id !== id) return note;
        changed = { ...note, ...patch, updatedAt: Date.now() };
        return changed;
      }),
    }));
    if (!changed) return;
    const note = changed;
    clearTimeout(pending.get(id));
    pending.set(
      id,
      setTimeout(() => void persist(note), SAVE_DELAY_MS),
    );
  },
  remove: (id) => {
    clearTimeout(pending.get(id));
    pending.delete(id);
    set((state) => {
      const notes = state.notes.filter((note) => note.id !== id);
      return {
        notes,
        activeId:
          state.activeId === id ? (notes[0]?.id ?? null) : state.activeId,
      };
    });
    void api()
      .deleteNote(id)
      .catch(() => undefined);
  },
  restore: (note) => {
    const restored = { ...note, updatedAt: Date.now() };
    set((state) => ({
      notes: [restored, ...state.notes.filter((item) => item.id !== note.id)],
      activeId: note.id,
    }));
    void persist(restored);
  },
  flush: async () => {
    const waiting = [...pending.keys()];
    await Promise.all(
      get()
        .notes.filter((note) => waiting.includes(note.id))
        .map(persist),
    );
  },
}));

/**
 * Opens notes over the page area. With `site`, notes start on that site's
 * newest note, or a fresh one that cites the page when it has none.
 */
export async function openNotes(
  site: { key: string; url: string; title: string } | null = null,
  options: { fresh?: boolean } = {},
): Promise<void> {
  await useOverlay.getState().open({ kind: 'notes' });
  // Another window may have written since: always read the file again.
  await useNotes
    .getState()
    .load()
    .catch(() => undefined);
  const { notes, activeId, create, select } = useNotes.getState();
  if (site) {
    const existing = notesForSite(notes, site.key)[0];
    if (existing && !options.fresh) return select(existing.id);
    create(`# ${site.title}\n\n${site.url}\n\n`, [site.key]);
    return;
  }
  if (!activeId || !notes.some((note) => note.id === activeId)) {
    if (notes[0]) select(notes[0].id);
  }
}
