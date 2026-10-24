import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate, MIGRATIONS, schemaVersion } from './migrations';
import { openTrailStore, SqliteTrailStore } from './sqlite-trail-store';
import type { StoredPage, StoredSession } from './trail-store';

function page(id: string, overrides: Partial<StoredPage> = {}): StoredPage {
  return {
    id,
    workspaceId: 'w1',
    parentId: null,
    url: `https://${id}.example/`,
    title: id,
    faviconUrl: null,
    customTitle: null,
    note: null,
    collapsed: false,
    history: null,
    createdAt: 1,
    lastActiveAt: 2,
    ...overrides,
  };
}

const SESSION: StoredSession = {
  workspaces: [
    { id: 'w1', name: 'Personal', activePageId: 'b', createdAt: 1 },
    { id: 'w2', name: 'Work', activePageId: null, createdAt: 2 },
  ],
  pages: [
    page('a', { collapsed: true, note: 'read later' }),
    page('b', {
      parentId: 'a',
      customTitle: 'Bee',
      history: {
        entries: [
          { url: 'https://a.example/', title: 'a', pageState: 'xyz' },
          { url: 'https://b.example/', title: 'b' },
        ],
        index: 1,
      },
    }),
    page('c', { parentId: 'a', url: null }),
    page('d'),
    page('w', { workspaceId: 'w2' }),
  ],
  activeWorkspaceId: 'w2',
  closed: [
    {
      workspaceId: 'w1',
      workspace: null,
      pages: [
        {
          id: 'x',
          parentId: null,
          index: 0,
          collapsed: false,
          customTitle: null,
          note: null,
          state: {
            url: 'https://x.example/',
            title: 'x',
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null,
          },
          history: null,
          createdAt: 1,
        },
      ],
      promotedChildIds: [],
      summary: { kind: 'pages', label: 'x', pageCount: 1, serial: 4 },
    },
  ],
};

function memoryStore() {
  return new SqliteTrailStore(new DatabaseSync(':memory:'));
}

describe('migrations', () => {
  it('applies every migration once and records the version', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  it('upgrades an older database without losing data', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, MIGRATIONS.slice(0, 1));
    db.exec("INSERT INTO preferences (key, value) VALUES ('kept', 'yes')");
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(new SqliteTrailStore(db).getPreference('kept')).toBe('yes');
  });

  it('rolls back a failing migration', () => {
    const db = new DatabaseSync(':memory:');
    expect(() =>
      migrate(db, ['CREATE TABLE t (x)', 'CREATE TABLE u (x); nonsense']),
    ).toThrow();
    expect(schemaVersion(db)).toBe(1);
  });

  it('refuses a database from a newer version', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer/);
  });
});

describe('SqliteTrailStore sessions', () => {
  it('starts empty', () => {
    expect(memoryStore().loadSession()).toBeNull();
  });

  it('round-trips a session in tree order', () => {
    const store = memoryStore();
    store.saveSession(SESSION);
    expect(store.loadSession()).toEqual(SESSION);
  });

  it('replaces the previous session on save', () => {
    const store = memoryStore();
    store.saveSession(SESSION);
    store.saveSession({
      workspaces: [SESSION.workspaces[0]!],
      pages: [page('d')],
      activeWorkspaceId: 'w1',
    });
    const loaded = store.loadSession()!;
    expect(loaded.pages.map((p) => p.id)).toEqual(['d']);
    expect(loaded.closed).toEqual([]);
    expect(loaded.workspaces[0]?.activePageId).toBeNull();
  });

  it('turns orphans into roots and drops unsafe or broken values', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteTrailStore(db);
    store.saveSession(SESSION);
    db.exec(`
      UPDATE pages SET parent_id = 'gone' WHERE id = 'd';
      UPDATE pages SET url = 'file:///etc/passwd' WHERE id = 'w';
      UPDATE pages SET history = '{not json' WHERE id = 'b';
      INSERT INTO closed_records (position, record) VALUES (9, '{"nope": 1}');
      INSERT INTO closed_records (position, record) VALUES (10, 'broken');
    `);
    const loaded = store.loadSession()!;
    expect(loaded.pages.find((p) => p.id === 'd')?.parentId).toBeNull();
    expect(loaded.pages.find((p) => p.id === 'w')?.url).toBeNull();
    expect(loaded.pages.find((p) => p.id === 'b')?.history).toBeNull();
    expect(loaded.closed).toHaveLength(1);
  });
});

describe('SqliteTrailStore history and preferences', () => {
  it('counts visits, keeps titles and searches every word', () => {
    const store = memoryStore();
    store.recordVisit('https://developer.mozilla.org/docs/Web', 10);
    store.recordVisit('https://developer.mozilla.org/docs/Web', 20);
    store.recordTitle(
      'https://developer.mozilla.org/docs/Web',
      'Web docs | MDN',
    );
    store.recordVisit('https://example.com/', 30);
    store.recordVisit('file:///nope', 40);

    expect(store.searchHistory('mdn web', 10)).toEqual([
      {
        url: 'https://developer.mozilla.org/docs/Web',
        title: 'Web docs | MDN',
        visitCount: 2,
        lastVisitedAt: 20,
      },
    ]);
    expect(store.searchHistory('example', 10)).toHaveLength(1);
    expect(store.searchHistory('nope', 10)).toHaveLength(0);
    expect(store.searchHistory('100%', 10)).toHaveLength(0);
  });

  it('stores preferences', () => {
    const store = memoryStore();
    expect(store.getPreference('x')).toBeNull();
    store.setPreference('x', '1');
    store.setPreference('x', '2');
    expect(store.getPreference('x')).toBe('2');
  });
});

describe('openTrailStore', () => {
  it('moves an unreadable database aside and starts fresh', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    writeFileSync(file, 'this is not a database'.repeat(100));
    const { store, recoveredFrom } = openTrailStore(file);
    expect(recoveredFrom).toMatch(/unreadable/);
    expect(store.loadSession()).toBeNull();
    store.close();
    expect(readdirSync(dir).some((name) => name.includes('unreadable'))).toBe(
      true,
    );
  });

  it('persists across reopening', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    const first = openTrailStore(file).store;
    first.saveSession(SESSION);
    first.close();
    const second = openTrailStore(file);
    expect(second.recoveredFrom).toBeNull();
    expect(second.store.loadSession()).toEqual(SESSION);
    second.store.close();
  });
});
