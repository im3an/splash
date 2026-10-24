import { create } from 'zustand';
import type { PaletteItem } from '../../shared/types';

interface SuggestionState {
  items: PaletteItem[];
  /** -1 while the typed text itself is what Enter submits. */
  selected: number;
  setItems(items: PaletteItem[]): void;
  select(index: number): void;
  move(delta: 1 | -1): void;
  clear(): void;
}

/** What the address bar suggests while the user types. */
export const useSuggestions = create<SuggestionState>()((set) => ({
  items: [],
  selected: -1,
  setItems: (items) => set({ items, selected: -1 }),
  select: (selected) => set({ selected }),
  move: (delta) =>
    set((state) => ({
      selected: Math.max(
        -1,
        Math.min(state.items.length - 1, state.selected + delta),
      ),
    })),
  clear: () => set({ items: [], selected: -1 }),
}));
