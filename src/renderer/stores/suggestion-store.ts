import { create } from 'zustand';
import type { PaletteItem } from '../../shared/types';
import { withSearchSuggestions } from '../lib/inline-completion';

interface SuggestionState {
  items: PaletteItem[];
  /** What was typed, to mark in the rows. */
  query: string;
  /** -1 while the typed text itself is what Enter submits. */
  selected: number;
  setItems(items: PaletteItem[], query: string): void;
  /** The engine's suggestions, which arrive after the rest. */
  addSearch(search: PaletteItem[]): void;
  select(index: number): void;
  move(delta: 1 | -1): void;
  clear(): void;
}

/** What the address bar suggests while the user types. */
export const useSuggestions = create<SuggestionState>()((set) => ({
  items: [],
  query: '',
  selected: -1,
  setItems: (items, query) => set({ items, query, selected: -1 }),
  addSearch: (search) =>
    set((state) => {
      const items = withSearchSuggestions(state.items, search, 3);
      // A row picked with the arrow keys stays picked as rows move.
      const picked = state.items[state.selected]?.id;
      return {
        items,
        selected: picked ? items.findIndex((item) => item.id === picked) : -1,
      };
    }),
  select: (selected) => set({ selected }),
  move: (delta) =>
    set((state) => ({
      selected: Math.max(
        -1,
        Math.min(state.items.length - 1, state.selected + delta),
      ),
    })),
  clear: () => set({ items: [], query: '', selected: -1 }),
}));
