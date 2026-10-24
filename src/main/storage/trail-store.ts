import type {
  PageId,
  SitePermission,
  WorkspaceAppearance,
  WorkspaceId,
} from '../../shared/types';
import type { ClosedRecord } from '../browser/closed-records';
import type { PageHistory } from '../browser/page-host';

/**
 * Persistence boundary for trails. Implemented with SQLite
 * (`sqlite-trail-store.ts`); nothing outside `storage/` should know that.
 */

export interface StoredWorkspace {
  id: WorkspaceId;
  name: string;
  appearance?: WorkspaceAppearance;
  activePageId: PageId | null;
  createdAt: number;
}

export interface StoredPage {
  id: PageId;
  workspaceId: WorkspaceId;
  parentId: PageId | null;
  url: string | null;
  title: string;
  faviconUrl: string | null;
  customTitle: string | null;
  note: string | null;
  collapsed: boolean;
  history: PageHistory | null;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Everything needed to bring a window back. Workspaces are in display
 * order; pages are in depth-first order, so siblings appear in sequence and
 * every parent precedes its children.
 */
export interface StoredSession {
  workspaces: StoredWorkspace[];
  pages: StoredPage[];
  activeWorkspaceId: WorkspaceId | null;
  /** Undo history for closed pages and workspaces, oldest first. */
  closed?: ClosedRecord[];
}

export interface HistoryMatch {
  url: string;
  title: string;
  visitCount: number;
  lastVisitedAt: number;
}

export interface TrailStore {
  loadSession(): StoredSession | null;
  saveSession(session: StoredSession): void;
  /** A page committed a navigation to `url`. */
  recordVisit(url: string, at: number): void;
  /** The page at `url` reported its title. */
  recordTitle(url: string, title: string): void;
  /** Past visits whose address or title contains every word of `query`. */
  searchHistory(query: string, limit: number): HistoryMatch[];
  getPreference(key: string): string | null;
  setPreference(key: string, value: string): void;
  /** `null` when the user hasn't decided for this site yet. */
  getPermission(origin: string, permission: SitePermission): boolean | null;
  setPermission(
    origin: string,
    permission: SitePermission,
    granted: boolean | null,
  ): void;
  /** Forgets every decision for `origin`, or for all sites. */
  clearPermissions(origin?: string): void;
  close(): void;
}
