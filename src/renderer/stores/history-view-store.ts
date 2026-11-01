import { create } from 'zustand';
import type { HistoryEntry } from '../../shared/types';

/** Session-only context: returning from a page resumes the same history search. */
export const useHistoryView = create<{
  query: string;
  selected: number;
  scrollTop: number;
  removed: HistoryEntry | null;
}>()(() => ({ query: '', selected: 0, scrollTop: 0, removed: null }));
