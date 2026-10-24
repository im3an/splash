import type { PageId } from '../../shared/types';

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
  collapsed: boolean;
}

export interface StoredTrail {
  pages: StoredPage[];
  activePageId: PageId | null;
}

export interface TrailStore {
  load(): StoredTrail | null;
  save(trail: StoredTrail): void;
  close(): void;
}
