import { rmSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Schema migrations, applied in order. `PRAGMA user_version` records how
 * many have run. Never edit a shipped migration — append a new one.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — trails, workspaces, preferences, browsing history.
  `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    active_page_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    parent_id TEXT,
    position INTEGER NOT NULL,
    url TEXT,
    title TEXT NOT NULL DEFAULT '',
    favicon_url TEXT,
    custom_title TEXT,
    note TEXT,
    collapsed INTEGER NOT NULL DEFAULT 0,
    history TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  );
  CREATE INDEX pages_by_workspace ON pages (workspace_id, position);
  CREATE TABLE preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE history (
    url TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visited_at INTEGER NOT NULL
  );
  CREATE INDEX history_by_recency ON history (last_visited_at DESC);
  `,
  // 2 — remembered permission decisions per origin.
  `
  CREATE TABLE permission_decisions (
    origin TEXT NOT NULL,
    permission TEXT NOT NULL,
    granted INTEGER NOT NULL,
    decided_at INTEGER NOT NULL,
    PRIMARY KEY (origin, permission)
  );
  `,
  // 3 — recently closed pages and workspaces, so undo survives a restart.
  `
  CREATE TABLE closed_records (
    position INTEGER PRIMARY KEY,
    record TEXT NOT NULL
  );
  `,
  // 4 — each workspace's look: icon, accent, frame and light/dark mode.
  `
  ALTER TABLE workspaces ADD COLUMN appearance TEXT;
  `,
  // 5 — the downloads list, so it survives a restart.
  `
  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    record TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );
  `,
  // 6 — the two pages a workspace shows side by side, as JSON.
  `
  ALTER TABLE workspaces ADD COLUMN split TEXT;
  `,
  // 7 — pinned pages, kept at the top of their trail.
  `
  ALTER TABLE pages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
  `,
  // 8 — each visit's favicon, so suggestions can show it.
  `
  ALTER TABLE history ADD COLUMN favicon_url TEXT;
  `,
];

export class SchemaTooNewError extends Error {}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as
    | { user_version: number }
    | undefined;
  return row?.user_version ?? 0;
}

/** Refuses, without writing anything, a database made by a newer Splash. */
export function assertSupportedSchema(
  db: DatabaseSync,
  migrations: readonly string[] = MIGRATIONS,
): void {
  const current = schemaVersion(db);
  if (current > migrations.length) {
    throw new SchemaTooNewError(
      `Database schema v${current} is newer than this app (v${migrations.length})`,
    );
  }
}

/**
 * Undoes the open transaction after a failure. SQLite may already have
 * rolled back (disk full, I/O error); then a second ROLLBACK would throw
 * and hide the error that matters, so it's skipped.
 */
export function rollback(db: DatabaseSync): void {
  if (db.isTransaction === false) return;
  try {
    db.exec('ROLLBACK');
  } catch {
    // Already rolled back; the caller rethrows the original error.
  }
}

/**
 * Before an older database is upgraded, keeps a copy of it as it was:
 * `splash.db.pre-v<N>`, where N is the version it's about to become. A
 * fresh database has nothing to keep. Returns the copy's path, if any.
 */
export function backupBeforeMigrating(
  db: DatabaseSync,
  file: string,
  migrations: readonly string[] = MIGRATIONS,
): string | null {
  const current = schemaVersion(db);
  if (current === 0 || current >= migrations.length) return null;
  const backup = `${file}.pre-v${current + 1}`;
  rmSync(backup, { force: true });
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  return backup;
}

/** Brings the database up to date, one migration per transaction. */
export function migrate(
  db: DatabaseSync,
  migrations: readonly string[] = MIGRATIONS,
): void {
  assertSupportedSchema(db, migrations);
  const current = schemaVersion(db);
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      rollback(db);
      throw error;
    }
  }
}
