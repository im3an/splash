import type { PageId, WorkspaceColor, WorkspaceId } from '../../shared/types';

/**
 * Persistence boundary for trails. Phase 4 implements this with SQLite
 * (better-sqlite3); nothing outside `storage/` should know that.
 */

export interface StoredPage {
  id: PageId;
  parentId: PageId | null;
  /** Position among siblings. */
  position: number;
  url: string | null;
  title: string;
  customTitle: string | null;
  collapsed: boolean;
}

export interface StoredWorkspace {
  id: WorkspaceId;
  name: string;
  color: WorkspaceColor;
  /** Position in the sidebar's workspace switcher. */
  position: number;
  pages: StoredPage[];
  activePageId: PageId | null;
}

export interface StoredWindow {
  workspaces: StoredWorkspace[];
  activeWorkspaceId: WorkspaceId;
}

export interface TrailStore {
  load(): StoredWindow | null;
  save(window: StoredWindow): void;
  close(): void;
}
