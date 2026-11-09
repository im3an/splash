/**
 * ⌘Z and ⇧⌘Z for the trail. Every toast that offers Undo (a close, a move, a
 * pin) also leaves its undo here, so Edit › Undo can take it back after the
 * toast has gone, and Edit › Redo can do it again. One history, as in a text
 * editor: something new done forgets what could be redone. An undo runs at most
 * once per turn, whether from the toast or from here, and presses wait their
 * turn because each step may be a round trip to the main process.
 */

const MAX_ENTRIES = 20;

/**
 * One step of an undo or redo. Rejecting means it failed. `false` from an undo
 * means it was already undone some other way (⇧⌘T), so ⌘Z moves on to the
 * change before; `false` from a redo means it couldn't be done.
 */
export type UndoStep = () => unknown;

interface Entry {
  label: string;
  undo: UndoStep;
  redo?: UndoStep;
}

export interface UndoResult {
  kind: 'undone' | 'redone' | 'undo-failed' | 'redo-failed' | 'nothing';
  /** What the change was, as its toast said it. */
  label: string;
  /** After an undo: whether ⇧⌘Z can do it again. */
  canRedo: boolean;
}

const NOTHING: UndoResult = { kind: 'nothing', label: '', canRedo: false };

let entries: Entry[] = [];
let undone: Entry[] = [];
let turn: Promise<unknown> = Promise.resolve();

function inTurn(step: () => Promise<UndoResult>): Promise<UndoResult> {
  const result = turn.then(step);
  turn = result.catch(() => undefined);
  return result;
}

/** Null if there was nothing left to undo in it. */
async function undoEntry(entry: Entry): Promise<UndoResult | null> {
  const { label } = entry;
  try {
    if ((await entry.undo()) === false) return null;
  } catch {
    return { kind: 'undo-failed', label, canRedo: false };
  }
  // With no way forward for this one, the ones before it can't be reached.
  undone = entry.redo ? [...undone, entry].slice(-MAX_ENTRIES) : [];
  return { kind: 'undone', label, canRedo: entry.redo !== undefined };
}

/** Records a change and returns its undo, which also forgets it. */
export function offerUndo(
  label: string,
  undo: UndoStep,
  redo?: UndoStep,
): () => Promise<UndoResult> {
  const entry: Entry = { label, undo, redo };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  undone = [];
  return () =>
    inTurn(async () => {
      if (!entries.includes(entry)) return NOTHING;
      entries = entries.filter((other) => other !== entry);
      return (await undoEntry(entry)) ?? NOTHING;
    });
}

/** Undoes the newest trail change still there to undo. */
export function undoLast(): Promise<UndoResult> {
  return inTurn(async () => {
    for (let entry = entries.at(-1); entry; entry = entries.at(-1)) {
      entries = entries.slice(0, -1);
      const result = await undoEntry(entry);
      if (result) return result;
    }
    return NOTHING;
  });
}

/** Does again the change undone last. */
export function redoLast(): Promise<UndoResult> {
  return inTurn(async () => {
    const entry = undone.at(-1);
    if (!entry?.redo) return NOTHING;
    undone = undone.slice(0, -1);
    const { label } = entry;
    try {
      if ((await entry.redo()) === false)
        return { kind: 'redo-failed', label, canRedo: false };
    } catch {
      return { kind: 'redo-failed', label, canRedo: false };
    }
    entries = [...entries, entry].slice(-MAX_ENTRIES);
    return { kind: 'redone', label, canRedo: false };
  });
}

export function resetTrailUndo(): void {
  entries = [];
  undone = [];
}
