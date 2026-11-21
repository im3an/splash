import { create } from 'zustand';

/**
 * Editor-side popovers that more than one piece of the editor can open:
 * the link field, the math field and the sketch pad.
 */
interface NoteUiState {
  /** The math being edited: a node at `pos`, or a new one at the selection. */
  math: { pos: number | null; latex: string; inline: boolean } | null;
  /** The sketch block being drawn: `pos` of its code block, or a new one. */
  sketch: { pos: number | null; source: string } | null;
  /** Asks the selection toolbar to open its link field. */
  linkRequest: number;
  set(patch: Partial<Omit<NoteUiState, 'set'>>): void;
}

export const useNoteUi = create<NoteUiState>()((set) => ({
  math: null,
  sketch: null,
  linkRequest: 0,
  set: (patch) => set(patch),
}));
