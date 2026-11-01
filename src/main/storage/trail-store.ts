import type {
  DownloadSummary,
  PageId,
  SitePermission,
  SplitView,
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
  split?: SplitView | null;
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
  pinned: boolean;
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
  /** The icon the page last showed, if it showed one. */
  faviconUrl?: string | null;
}

export interface HistoryRow {
  faviconUrl?: string | null;
  url: string;
  title: string;
  visitCount: number;
  lastVisitedAt: number;
}

export interface PermissionRecord {
  origin: string;
  permission: SitePermission;
  granted: boolean;
}

export interface TrailStore {
  loadSession(): StoredSession | null;
  saveSession(session: StoredSession): void;
  /** A page committed a navigation to `url`. */
  recordVisit(url: string, at: number): void;
  /** The page at `url` reported its title. */
  recordTitle(url: string, title: string): void;
  /** The page at `url` reported its favicon. */
  recordFavicon(url: string, faviconUrl: string): void;
  /** Past visits whose address or title contains every word of `query`. */
  searchHistory(query: string, limit: number): HistoryMatch[];
  /**
   * The visits used most recently and the ones used most often, up to
   * `limit` of each, for suggestions to rank and complete from.
   */
  frequentHistory(limit: number): HistoryMatch[];
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
  /** Every remembered permission decision, by site. */
  listPermissions(): PermissionRecord[];
  /** Recent history, newest first; only matching entries when `query` is set. */
  listHistory(query: string, limit: number): HistoryRow[];
  /** Forgets every visit to `url`. */
  deleteHistoryEntry(url: string): void;
  /** Removes history visited at or after `since`, returning what went. */
  deleteHistory(since: number): HistoryRow[];
  /** Puts deleted history back (undo). */
  restoreHistory(rows: HistoryRow[]): void;
  loadDownloads(): DownloadSummary[];
  saveDownload(download: DownloadSummary): void;
  deleteDownload(id: string): void;
  close(): void;
}
