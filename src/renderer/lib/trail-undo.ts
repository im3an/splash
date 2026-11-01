/**
 * ⌘Z for the trail. Every toast that offers Undo (a close, a move, a pin)
 * also leaves its undo here, so Edit › Undo can take it back after the
 * toast has gone. Newest first; an undo runs at most once, whether from
 * the toast or from here. There is no redo for trail changes.
 */

const MAX_ENTRIES = 20;

interface Entry {
  label: string;
  run(): void;
}

let entries: Entry[] = [];

/** Records an undo and returns its runner, which also forgets it. */
export function offerUndo(label: string, run: () => void): () => void {
  const entry: Entry = { label, run };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  return () => {
    if (!entries.includes(entry)) return;
    entries = entries.filter((other) => other !== entry);
    entry.run();
  };
}

/** Undoes the newest trail change; false when there is none. */
export function undoLast(): boolean {
  const entry = entries.at(-1);
  if (!entry) return false;
  entries = entries.slice(0, -1);
  entry.run();
  return true;
}

export function resetTrailUndo(): void {
  entries = [];
}
