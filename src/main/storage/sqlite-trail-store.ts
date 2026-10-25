import { existsSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { workspaceAppearanceSchema } from '../../shared/ipc';
import type {
  DownloadSummary,
  PageId,
  SitePermission,
  SplitView,
  WorkspaceAppearance,
} from '../../shared/types';
import { isClosedRecord, type ClosedRecord } from '../browser/closed-records';
import type { PageHistory } from '../browser/page-host';
import { isNavigableUrl, isPageUrl } from '../browser/url';
import {
  assertSupportedSchema,
  migrate,
  SchemaTooNewError,
} from './migrations';
import type {
  HistoryMatch,
  HistoryRow,
  PermissionRecord,
  StoredPage,
  StoredSession,
  StoredWorkspace,
  TrailStore,
} from './trail-store';

const ACTIVE_WORKSPACE_KEY = 'session.activeWorkspaceId';
const MAX_FAVICON_URL_LENGTH = 16_384;

interface WorkspaceRow {
  id: string;
  name: string;
  appearance: string | null;
  split: string | null;
  active_page_id: string | null;
  created_at: number;
}

interface PageRow {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  position: number;
  url: string | null;
  title: string;
  favicon_url: string | null;
  custom_title: string | null;
  note: string | null;
  collapsed: number;
  pinned: number;
  history: string | null;
  created_at: number;
  last_active_at: number;
}

/** Reads stored history defensively: a bad value only loses that history. */
function parseHistory(value: string | null): PageHistory | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PageHistory;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(
          (entry) =>
            typeof entry?.url === 'string' &&
            isPageUrl(entry.url) &&
            typeof entry.title === 'string',
        )
      : [];
    if (entries.length === 0) return null;
    const index = Number.isInteger(parsed.index) ? parsed.index : 0;
    return {
      entries,
      index: Math.max(0, Math.min(entries.length - 1, index)),
    };
  } catch {
    return null;
  }
}

/** A saved look, or the default when it is missing or no longer valid. */
function parseAppearance(value: string | null): WorkspaceAppearance {
  if (!value) return DEFAULT_APPEARANCE;
  try {
    const parsed = workspaceAppearanceSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** A saved split view; the controller checks its pages still exist. */
function parseSplit(value: string | null): SplitView | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SplitView> | null;
    return typeof parsed?.leftId === 'string' &&
      typeof parsed.rightId === 'string'
      ? { leftId: parsed.leftId, rightId: parsed.rightId }
      : null;
  } catch {
    return null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class SqliteTrailStore implements TrailStore {
  constructor(private readonly db: DatabaseSync) {
    // Wait briefly instead of failing if another process holds a lock.
    db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
    migrate(db);
  }

  loadSession(): StoredSession | null {
    const workspaceRows = this.db
      .prepare(
        'SELECT id, name, appearance, split, active_page_id, created_at FROM workspaces ORDER BY position',
      )
      .all() as unknown as WorkspaceRow[];
    if (workspaceRows.length === 0) return null;

    const pageRows = this.db
      .prepare('SELECT * FROM pages ORDER BY workspace_id, position')
      .all() as unknown as PageRow[];
    const byId = new Map(pageRows.map((row) => [row.id, row]));
    const children = new Map<string, PageRow[]>();
    for (const row of pageRows) {
      // A page whose parent is missing (or in another workspace) becomes a root.
      const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
      const parentKey =
        parent && parent.workspace_id === row.workspace_id ? parent.id : '';
      const key = `${row.workspace_id}/${parentKey}`;
      const list = children.get(key) ?? [];
      list.push(row);
      children.set(key, list);
    }

    const pages: StoredPage[] = [];
    const workspaces: StoredWorkspace[] = [];
    for (const workspace of workspaceRows) {
      const visit = (parentId: PageId | null) => {
        for (const row of children.get(`${workspace.id}/${parentId ?? ''}`) ??
          []) {
          pages.push({
            id: row.id,
            workspaceId: workspace.id,
            parentId,
            url: row.url && isPageUrl(row.url) ? row.url : null,
            title: row.title,
            faviconUrl: row.favicon_url,
            customTitle: row.custom_title,
            note: row.note,
            collapsed: row.collapsed === 1,
            pinned: row.pinned === 1,
            history: parseHistory(row.history),
            createdAt: row.created_at,
            lastActiveAt: row.last_active_at,
          });
          visit(row.id);
        }
      };
      visit(null);
      const split = parseSplit(workspace.split);
      const activeExists =
        workspace.active_page_id !== null &&
        byId.get(workspace.active_page_id)?.workspace_id === workspace.id;
      workspaces.push({
        id: workspace.id,
        name: workspace.name,
        appearance: parseAppearance(workspace.appearance),
        activePageId: activeExists ? workspace.active_page_id : null,
        createdAt: workspace.created_at,
        ...(split ? { split } : {}),
      });
    }

    const activeWorkspaceId = this.getPreference(ACTIVE_WORKSPACE_KEY);
    return {
      workspaces,
      pages,
      activeWorkspaceId: workspaces.some((w) => w.id === activeWorkspaceId)
        ? activeWorkspaceId
        : (workspaces[0]?.id ?? null),
      closed: this.loadClosedRecords(),
    };
  }

  private loadClosedRecords(): ClosedRecord[] {
    const rows = this.db
      .prepare('SELECT record FROM closed_records ORDER BY position')
      .all() as unknown as { record: string }[];
    const records: ClosedRecord[] = [];
    for (const row of rows) {
      try {
        const record: unknown = JSON.parse(row.record);
        if (isClosedRecord(record)) records.push(record);
      } catch {
        // A damaged record only costs that one undo step.
      }
    }
    return records;
  }

  saveSession(session: StoredSession): void {
    const insertWorkspace = this.db.prepare(
      `INSERT INTO workspaces (id, name, appearance, split, position, active_page_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPage = this.db.prepare(
      `INSERT INTO pages (id, workspace_id, parent_id, position, url, title,
         favicon_url, custom_title, note, collapsed, pinned, history, created_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.transaction(() => {
      this.db.exec('DELETE FROM pages; DELETE FROM workspaces;');
      session.workspaces.forEach((workspace, position) => {
        insertWorkspace.run(
          workspace.id,
          workspace.name,
          workspace.appearance ? JSON.stringify(workspace.appearance) : null,
          workspace.split ? JSON.stringify(workspace.split) : null,
          position,
          workspace.activePageId,
          workspace.createdAt,
        );
      });
      const positions = new Map<string, number>();
      for (const page of session.pages) {
        const key = `${page.workspaceId}/${page.parentId ?? ''}`;
        const position = positions.get(key) ?? 0;
        positions.set(key, position + 1);
        insertPage.run(
          page.id,
          page.workspaceId,
          page.parentId,
          position,
          page.url,
          page.title,
          page.faviconUrl,
          page.customTitle,
          page.note,
          page.collapsed ? 1 : 0,
          page.pinned ? 1 : 0,
          page.history ? JSON.stringify(page.history) : null,
          page.createdAt,
          page.lastActiveAt,
        );
      }
      if (session.activeWorkspaceId) {
        this.setPreference(ACTIVE_WORKSPACE_KEY, session.activeWorkspaceId);
      }
      this.db.exec('DELETE FROM closed_records');
      const insertClosed = this.db.prepare(
        'INSERT INTO closed_records (position, record) VALUES (?, ?)',
      );
      (session.closed ?? []).forEach((record, position) => {
        insertClosed.run(position, JSON.stringify(record));
      });
    });
  }

  recordVisit(url: string, at: number): void {
    if (!isNavigableUrl(url)) return;
    this.db
      .prepare(
        `INSERT INTO history (url, visit_count, last_visited_at) VALUES (?, 1, ?)
         ON CONFLICT (url) DO UPDATE SET
           visit_count = visit_count + 1,
           last_visited_at = excluded.last_visited_at`,
      )
      .run(url, at);
  }

  recordTitle(url: string, title: string): void {
    this.db
      .prepare('UPDATE history SET title = ? WHERE url = ?')
      .run(title.slice(0, 500), url);
  }

  recordFavicon(url: string, faviconUrl: string): void {
    // Inline icons can be large; those are left to the open page.
    if (faviconUrl.length > MAX_FAVICON_URL_LENGTH) return;
    this.db
      .prepare('UPDATE history SET favicon_url = ? WHERE url = ?')
      .run(faviconUrl, url);
  }

  searchHistory(query: string, limit: number): HistoryMatch[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (words.length === 0) return [];
    const conditions = words
      .map(
        () =>
          "(lower(url) LIKE ? ESCAPE '\\' OR lower(title) LIKE ? ESCAPE '\\')",
      )
      .join(' AND ');
    const params = words.flatMap((word) => {
      const pattern = `%${escapeLike(word)}%`;
      return [pattern, pattern];
    });
    const rows = this.db
      .prepare(
        `SELECT url, title, visit_count, last_visited_at, favicon_url FROM history
         WHERE ${conditions}
         ORDER BY last_visited_at DESC LIMIT ?`,
      )
      .all(...params, limit) as unknown as {
      url: string;
      title: string;
      visit_count: number;
      last_visited_at: number;
      favicon_url: string | null;
    }[];
    return rows.map((row) => ({
      url: row.url,
      title: row.title,
      visitCount: row.visit_count,
      lastVisitedAt: row.last_visited_at,
      faviconUrl: row.favicon_url,
    }));
  }

  frequentHistory(limit: number): HistoryMatch[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (SELECT url, title, visit_count, last_visited_at, favicon_url FROM history
           ORDER BY last_visited_at DESC LIMIT ?)
         UNION
         SELECT * FROM (SELECT url, title, visit_count, last_visited_at, favicon_url FROM history
           ORDER BY visit_count DESC, last_visited_at DESC LIMIT ?)`,
      )
      .all(limit, limit) as unknown as {
      url: string;
      title: string;
      visit_count: number;
      last_visited_at: number;
      favicon_url: string | null;
    }[];
    return rows.map((row) => ({
      url: row.url,
      title: row.title,
      visitCount: row.visit_count,
      lastVisitedAt: row.last_visited_at,
      faviconUrl: row.favicon_url,
    }));
  }

  getPreference(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM preferences WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setPreference(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getPermission(origin: string, permission: SitePermission): boolean | null {
    const row = this.db
      .prepare(
        'SELECT granted FROM permission_decisions WHERE origin = ? AND permission = ?',
      )
      .get(origin, permission) as { granted: number } | undefined;
    return row ? row.granted === 1 : null;
  }

  setPermission(
    origin: string,
    permission: SitePermission,
    granted: boolean | null,
  ): void {
    if (granted === null) {
      this.db
        .prepare(
          'DELETE FROM permission_decisions WHERE origin = ? AND permission = ?',
        )
        .run(origin, permission);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO permission_decisions (origin, permission, granted, decided_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (origin, permission) DO UPDATE SET
           granted = excluded.granted, decided_at = excluded.decided_at`,
      )
      .run(origin, permission, granted ? 1 : 0, Date.now());
  }

  clearPermissions(origin?: string): void {
    if (origin === undefined) {
      this.db.exec('DELETE FROM permission_decisions');
    } else {
      this.db
        .prepare('DELETE FROM permission_decisions WHERE origin = ?')
        .run(origin);
    }
  }

  listPermissions(): PermissionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT origin, permission, granted FROM permission_decisions ORDER BY origin, permission',
      )
      .all() as unknown as {
      origin: string;
      permission: SitePermission;
      granted: number;
    }[];
    return rows.map((row) => ({
      origin: row.origin,
      permission: row.permission,
      granted: row.granted === 1,
    }));
  }

  listHistory(query: string, limit: number): HistoryRow[] {
    if (query.trim()) return this.searchHistory(query, limit);
    const rows = this.db
      .prepare(
        `SELECT url, title, visit_count, last_visited_at FROM history
         ORDER BY last_visited_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as {
      url: string;
      title: string;
      visit_count: number;
      last_visited_at: number;
    }[];
    return rows.map((row) => ({
      url: row.url,
      title: row.title,
      visitCount: row.visit_count,
      lastVisitedAt: row.last_visited_at,
    }));
  }

  deleteHistoryEntry(url: string): void {
    this.db.prepare('DELETE FROM history WHERE url = ?').run(url);
  }

  deleteHistory(since: number): HistoryRow[] {
    let removed: HistoryRow[] = [];
    this.transaction(() => {
      removed = (
        this.db
          .prepare(
            'SELECT url, title, visit_count, last_visited_at FROM history WHERE last_visited_at >= ?',
          )
          .all(since) as unknown as {
          url: string;
          title: string;
          visit_count: number;
          last_visited_at: number;
        }[]
      ).map((row) => ({
        url: row.url,
        title: row.title,
        visitCount: row.visit_count,
        lastVisitedAt: row.last_visited_at,
      }));
      this.db
        .prepare('DELETE FROM history WHERE last_visited_at >= ?')
        .run(since);
    });
    return removed;
  }

  restoreHistory(rows: HistoryRow[]): void {
    const insert = this.db.prepare(
      `INSERT INTO history (url, title, visit_count, last_visited_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (url) DO UPDATE SET
         title = excluded.title,
         visit_count = history.visit_count + excluded.visit_count,
         last_visited_at = max(history.last_visited_at, excluded.last_visited_at)`,
    );
    this.transaction(() => {
      for (const row of rows) {
        insert.run(row.url, row.title, row.visitCount, row.lastVisitedAt);
      }
    });
  }

  loadDownloads(): DownloadSummary[] {
    const rows = this.db
      .prepare('SELECT record FROM downloads ORDER BY started_at DESC')
      .all() as unknown as { record: string }[];
    const downloads: DownloadSummary[] = [];
    for (const row of rows) {
      try {
        const record = JSON.parse(row.record) as DownloadSummary;
        if (typeof record.id === 'string' && typeof record.url === 'string') {
          downloads.push(record);
        }
      } catch {
        // A damaged entry only drops out of the list.
      }
    }
    return downloads;
  }

  saveDownload(download: DownloadSummary): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, record, started_at) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET record = excluded.record`,
      )
      .run(download.id, JSON.stringify(download), download.startedAt);
  }

  deleteDownload(id: string): void {
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  private transaction(run: () => void): void {
    this.db.exec('BEGIN');
    try {
      run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export interface OpenStoreResult {
  store: SqliteTrailStore;
  /** Set when an unreadable database was moved aside and replaced. */
  recoveredFrom: string | null;
}

/**
 * Opens (or creates) the database at `file`. A database that cannot be
 * opened or migrated is kept next to it for inspection and replaced with a
 * fresh one, so a corrupt file never stops the browser from starting.
 */
export function openTrailStore(file: string): OpenStoreResult {
  const open = () => {
    const db = new DatabaseSync(file);
    try {
      // Check first: even switching the journal mode would modify a file
      // that belongs to a newer version.
      assertSupportedSchema(db);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      return new SqliteTrailStore(db);
    } catch (error) {
      db.close();
      throw error;
    }
  };
  try {
    return { store: open(), recoveredFrom: null };
  } catch (error) {
    // A newer app wrote this database; keep it intact for that version.
    if (error instanceof SchemaTooNewError || !existsSync(file)) throw error;
    const aside = `${file}.unreadable-${Date.now()}`;
    renameSync(file, aside);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(file + suffix)) renameSync(file + suffix, aside + suffix);
    }
    return { store: open(), recoveredFrom: aside };
  }
}
