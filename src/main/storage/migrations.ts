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
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
