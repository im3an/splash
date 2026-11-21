import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_NOTE_SITES, type Note } from '../../shared/notes';

/**
 * Notes live in one JSON file in the profile folder, written whole and
 * swapped in, so a crash mid-write leaves the last good copy.
 */
export class NotesStore {
  private notes: Note[] | null = null;

  constructor(private readonly file: string) {}

  list(): Note[] {
    return [...this.load()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  save(input: { id?: string; body: string; sites: string[] }): Note {
    const notes = this.load();
    const now = Date.now();
    const sites = [...new Set(input.sites)].slice(0, MAX_NOTE_SITES);
    const existing = input.id
      ? notes.find((note) => note.id === input.id)
      : undefined;
    let note: Note;
    if (existing) {
      existing.body = input.body;
      existing.sites = sites;
      existing.updatedAt = now;
      note = existing;
    } else {
      note = {
        id: input.id ?? randomUUID(),
        body: input.body,
        sites,
        createdAt: now,
        updatedAt: now,
      };
      notes.push(note);
    }
    this.write();
    return { ...note };
  }

  delete(id: string): void {
    const notes = this.load();
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) return;
    notes.splice(index, 1);
    this.write();
  }

  private load(): Note[] {
    if (this.notes) return this.notes;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.notes = Array.isArray(parsed) ? parsed.filter(isNote) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Keep the unreadable file rather than writing over it.
        try {
          fs.renameSync(this.file, `${this.file}.unreadable-${Date.now()}`);
        } catch {
          // Nothing more to save.
        }
      }
      this.notes = [];
    }
    return this.notes;
  }

  private write(): void {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(this.notes ?? []), 'utf8');
    fs.renameSync(temporary, this.file);
  }
}

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === 'string' &&
    typeof note.body === 'string' &&
    Array.isArray(note.sites) &&
    note.sites.every((site) => typeof site === 'string') &&
    typeof note.createdAt === 'number' &&
    typeof note.updatedAt === 'number'
  );
}
