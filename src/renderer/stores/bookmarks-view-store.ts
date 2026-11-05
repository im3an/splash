import { create } from 'zustand';
import { setFolderCollapsed } from '../lib/bookmarks';
import { useShell } from './shell-store';

interface BookmarksViewState {
  query: string;
  /** The row the keyboard is on, and the one scrolled to on opening. */
  activeId: string | null;
}

/** The manager's place, kept while it's closed like History's. */
export const useBookmarksView = create<BookmarksViewState>()(() => ({
  query: '',
  activeId: null,
}));

/** Opens the manager, at a folder if given. */
export function showBookmarks(folderId?: string) {
  if (folderId) {
    useBookmarksView.setState({ query: '', activeId: folderId });
    void setFolderCollapsed(folderId, false);
  }
  useShell.getState().setSidebarPanel('bookmarks');
}
