import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { PageGroup } from '../../shared/types';
import { migrate, MIGRATIONS, schemaVersion } from './migrations';
import {
  openTrailStore,
  SqliteTrailStore,
  toStoredJson,
} from './sqlite-trail-store';
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
    pinned: false,
    history: null,
    createdAt: 1,
    lastActiveAt: 2,
    ...overrides,
  };
}

const SESSION: StoredSession = {
  workspaces: [
    {
      id: 'w1',
      name: 'Personal',
      activePageId: 'b',
      split: { leftId: 'a', rightId: 'b' },
      createdAt: 1,
      appearance: {
        icon: { kind: 'symbol', name: 'leaf' },
        accent: '#336699',
        frame: 'sage',
        mode: 'dark',
      },
    },
    {
      id: 'w2',
      name: 'Work',
      activePageId: null,
      createdAt: 2,
      appearance: DEFAULT_APPEARANCE,
    },
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
    page('d', { pinned: true }),
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
            isAudible: false,
            isMuted: false,
            zoomPercent: 100,
            find: null,
            isUnresponsive: false,
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

/** What a saved session reads back as: form state never reaches disk. */
const STORED: StoredSession = JSON.parse(toStoredJson(SESSION));

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

  it('turns a workspace’s old System, the Theme in Settings, into Default', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, MIGRATIONS.slice(0, 11));
    const insert = db.prepare(
      'INSERT INTO workspaces (id, name, appearance, position, created_at) VALUES (?, ?, ?, ?, 1)',
    );
    const look = (mode: string) =>
      JSON.stringify({
        icon: { kind: 'letter' },
        accent: 'ember',
        frame: 'paper',
        mode,
      });
    insert.run('a', 'A', look('system'), 0);
    insert.run('b', 'B', look('dark'), 1);
    insert.run('c', 'C', null, 2);
    migrate(db);
    const modes = db
      .prepare(
        "SELECT id, json_extract(appearance, '$.mode') AS mode FROM workspaces ORDER BY id",
      )
      .all();
    expect(modes).toEqual([
      { id: 'a', mode: 'default' },
      { id: 'b', mode: 'dark' },
      { id: 'c', mode: null },
    ]);
  });

  it('keeps existing history and site decisions in the default profile', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, MIGRATIONS.slice(0, 12));
    db.exec(`
      INSERT INTO history (url, title, visit_count, last_visited_at, favicon_url)
        VALUES ('https://mail.example/', 'Mail', 3, 30, 'https://mail.example/i.png');
      INSERT INTO permission_decisions (origin, permission, granted, decided_at)
        VALUES ('https://meet.example', 'camera', 1, 5);
    `);
    migrate(db);
    const kept = new SqliteTrailStore(db);
    expect(kept.profile).toBe('web');
    expect(kept.listHistory('', 10)).toEqual([
      {
        url: 'https://mail.example/',
        title: 'Mail',
        visitCount: 3,
        lastVisitedAt: 30,
        faviconUrl: 'https://mail.example/i.png',
      },
    ]);
    expect(kept.getPermission('https://meet.example', 'camera')).toBe(true);
    // A workspace with a profile of its own starts with none of it.
    const fresh = kept.forProfile('ws-two');
    expect(fresh.listHistory('', 10)).toEqual([]);
    expect(fresh.getPermission('https://meet.example', 'camera')).toBeNull();
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
    expect(store.loadSession()).toEqual(STORED);
  });

  it('never writes typed form state to disk', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteTrailStore(db);
    const withDraft = structuredClone(SESSION);
    withDraft.closed![0]!.pages[0]!.history = {
      entries: [
        { url: 'https://x.example/', title: 'x', pageState: 'draft-text' },
      ],
      index: 0,
    };
    store.saveSession(withDraft);
    const rows = db
      .prepare(
        'SELECT history AS value FROM pages UNION ALL SELECT record FROM closed_records',
      )
      .all() as { value: string | null }[];
    for (const { value } of rows) {
      expect(value ?? '').not.toContain('pageState');
      expect(value ?? '').not.toContain('draft-text');
    }
    expect(
      store.loadSession()!.pages.find((p) => p.id === 'b')!.history!.entries[0],
    ).toEqual({ url: 'https://a.example/', title: 'a' });
  });

  it('drops page state saved by older versions', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteTrailStore(db);
    store.saveSession(SESSION);
    db.prepare("UPDATE pages SET history = ? WHERE id = 'b'").run(
      JSON.stringify(SESSION.pages[1]!.history),
    );
    expect(
      store.loadSession()!.pages.find((p) => p.id === 'b')!.history!.entries[0],
    ).toEqual({ url: 'https://a.example/', title: 'a' });
  });

  it('keeps where the user was in a page, only for its own addresses', () => {
    const store = memoryStore();
    const withPlaces = structuredClone(SESSION);
    const place = {
      url: 'https://a.example/',
      scrollX: 0,
      scrollY: 2400,
      media: [{ index: 0, src: '', time: 90, duration: 600, playing: true }],
    };
    withPlaces.pages[1]!.history = {
      entries: [{ url: 'https://a.example/', title: 'a' }],
      index: 0,
      places: [
        place,
        { ...place, url: 'https://elsewhere.example/' },
        { ...place, url: 'https://a.example/', scrollY: -5 },
      ],
    };
    store.saveSession(withPlaces);
    expect(
      store.loadSession()!.pages.find((p) => p.id === 'b')!.history!.places,
    ).toEqual([place]);
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

  it('falls back to the default look for missing or invalid appearances', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteTrailStore(db);
    store.saveSession(SESSION);
    db.exec(`
      UPDATE workspaces SET appearance = NULL WHERE id = 'w1';
      UPDATE workspaces SET appearance = '{"icon":{"kind":"script"}}' WHERE id = 'w2';
    `);
    const loaded = store.loadSession()!;
    expect(loaded.workspaces.map((w) => w.appearance)).toEqual([
      DEFAULT_APPEARANCE,
      DEFAULT_APPEARANCE,
    ]);
  });

  it('keeps a group’s icon, and drops one it can’t draw', () => {
    const store = memoryStore();
    const group = (id: string, icon: unknown) =>
      ({ id, name: id, collapsed: false, icon }) as PageGroup;
    store.saveSession({
      ...SESSION,
      workspaces: SESSION.workspaces.map((workspace, index) =>
        index === 0
          ? {
              ...workspace,
              groups: [
                group('emoji', { kind: 'emoji', value: '🐎' }),
                group('empty', { kind: 'emoji', value: '' }),
                group('symbol', { kind: 'symbol', name: 'leaf' }),
                group('broken', 7),
              ],
            }
          : workspace,
      ),
    });
    const groups = store.loadSession()!.workspaces[0]!.groups!;
    expect(groups.map((item) => item.icon)).toEqual([
      { kind: 'emoji', value: '🐎' },
      undefined,
      undefined,
      undefined,
    ]);
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
        faviconUrl: null,
      },
    ]);
    expect(store.searchHistory('example', 10)).toHaveLength(1);
    expect(store.searchHistory('nope', 10)).toHaveLength(0);
    expect(store.searchHistory('100%', 10)).toHaveLength(0);
  });

  it('keeps the favicon each visit showed', () => {
    const store = memoryStore();
    store.recordVisit('https://www.youtube.com/', 1);
    store.recordFavicon(
      'https://www.youtube.com/',
      'https://www.youtube.com/favicon.ico',
    );
    store.recordFavicon(
      'https://www.youtube.com/',
      `data:image/png;base64,${'A'.repeat(20_000)}`,
    );
    expect(store.searchHistory('youtube', 1)[0]?.faviconUrl).toBe(
      'https://www.youtube.com/favicon.ico',
    );
    expect(store.frequentHistory(1)[0]?.faviconUrl).toBe(
      'https://www.youtube.com/favicon.ico',
    );
    expect(store.listHistory('', 10)[0]?.faviconUrl).toBe(
      'https://www.youtube.com/favicon.ico',
    );
    const removed = store.deleteHistory(0);
    store.restoreHistory(removed);
    expect(store.listHistory('', 10)[0]?.faviconUrl).toBe(
      'https://www.youtube.com/favicon.ico',
    );
  });

  it('offers history used most recently and most often', () => {
    const store = memoryStore();
    for (let at = 1; at <= 5; at++)
      store.recordVisit('https://often.example/', at);
    store.recordVisit('https://once.example/', 6);
    store.recordVisit('https://latest.example/', 7);
    const urls = store
      .frequentHistory(1)
      .map((row) => row.url)
      .toSorted();
    expect(urls).toEqual(['https://latest.example/', 'https://often.example/']);
    expect(store.frequentHistory(10)).toHaveLength(3);
  });

  it('remembers, changes and forgets permission decisions', () => {
    const store = memoryStore();
    const site = 'https://meet.example';
    expect(store.getPermission(site, 'camera')).toBeNull();
    store.setPermission(site, 'camera', true);
    store.setPermission(site, 'microphone', false);
    store.setPermission('https://other.example', 'camera', false);
    expect(store.getPermission(site, 'camera')).toBe(true);
    expect(store.getPermission(site, 'microphone')).toBe(false);

    store.setPermission(site, 'camera', null);
    expect(store.getPermission(site, 'camera')).toBeNull();
    store.clearPermissions(site);
    expect(store.getPermission(site, 'microphone')).toBeNull();
    expect(store.getPermission('https://other.example', 'camera')).toBe(false);
    store.clearPermissions();
    expect(store.getPermission('https://other.example', 'camera')).toBeNull();
  });

  it('clears history by time and puts it back', () => {
    const store = memoryStore();
    store.recordVisit('https://old.example/', 100);
    store.recordVisit('https://new.example/', 500);
    store.recordTitle('https://new.example/', 'New');
    const removed = store.deleteHistory(300);
    expect(removed).toEqual([
      {
        url: 'https://new.example/',
        title: 'New',
        visitCount: 1,
        lastVisitedAt: 500,
        faviconUrl: null,
      },
    ]);
    expect(store.searchHistory('example', 10)).toHaveLength(1);
    store.restoreHistory(removed);
    expect(store.searchHistory('new', 10)[0]?.title).toBe('New');
  });

  it('lists recent history and forgets one address', () => {
    const store = memoryStore();
    store.recordVisit('https://a.example/', 100);
    store.recordVisit('https://b.example/', 300);
    store.recordVisit('https://c.example/', 200);
    store.recordTitle('https://c.example/', 'Recipes');
    expect(store.listHistory('', 2).map((row) => row.url)).toEqual([
      'https://b.example/',
      'https://c.example/',
    ]);
    expect(store.listHistory('recipes', 10).map((row) => row.url)).toEqual([
      'https://c.example/',
    ]);
    store.deleteHistoryEntry('https://b.example/');
    expect(store.listHistory('', 10).map((row) => row.url)).toEqual([
      'https://c.example/',
      'https://a.example/',
    ]);
  });

  it('lists permission decisions by site', () => {
    const store = memoryStore();
    store.setPermission('https://b.example', 'camera', true);
    store.setPermission('https://a.example', 'location', false);
    expect(store.listPermissions()).toEqual([
      { origin: 'https://a.example', permission: 'location', granted: false },
      { origin: 'https://b.example', permission: 'camera', granted: true },
    ]);
  });

  it('stores preferences', () => {
    const store = memoryStore();
    expect(store.getPreference('x')).toBeNull();
    store.setPreference('x', '1');
    store.setPreference('x', '2');
    expect(store.getPreference('x')).toBe('2');
  });
});

describe('SqliteTrailStore profiles', () => {
  it('keeps each profile’s history apart', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    home.recordVisit('https://news.example/', 10);
    work.recordVisit('https://intranet.example/', 20);
    work.recordVisit('https://intranet.example/', 30);
    work.recordTitle('https://intranet.example/', 'Intranet');
    home.recordTitle('https://intranet.example/', 'Not here');

    expect(home.listHistory('', 10).map((row) => row.url)).toEqual([
      'https://news.example/',
    ]);
    expect(work.listHistory('', 10)).toEqual([
      expect.objectContaining({
        url: 'https://intranet.example/',
        title: 'Intranet',
        visitCount: 2,
      }),
    ]);
    expect(home.searchHistory('intranet', 10)).toEqual([]);
    expect(work.frequentHistory(10).map((row) => row.url)).toEqual([
      'https://intranet.example/',
    ]);
  });

  it('lets the same address be in two profiles', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    home.recordVisit('https://mail.example/', 10);
    work.recordVisit('https://mail.example/', 20);
    work.deleteHistoryEntry('https://mail.example/');
    expect(home.listHistory('', 10).map((row) => row.url)).toEqual([
      'https://mail.example/',
    ]);
    expect(work.listHistory('', 10)).toEqual([]);
    expect(work.deleteHistory(0)).toEqual([]);
    expect(home.deleteHistory(0)).toHaveLength(1);
  });

  it('keeps site decisions per profile', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    home.setPermission('https://meet.example', 'camera', true);
    work.setPermission('https://meet.example', 'camera', false);
    work.setPermission('https://ads.example', 'ads', true);
    expect(home.getPermission('https://meet.example', 'camera')).toBe(true);
    expect(work.getPermission('https://meet.example', 'camera')).toBe(false);
    expect(home.listPermissions()).toEqual([
      { origin: 'https://meet.example', permission: 'camera', granted: true },
    ]);
    work.clearPermissions();
    expect(work.listPermissions()).toEqual([]);
    expect(home.getPermission('https://meet.example', 'camera')).toBe(true);
  });

  it('shares everything else between profiles', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    work.setPreference('theme', 'dark');
    expect(home.getPreference('theme')).toBe('dark');
    work.saveSession(SESSION);
    expect(home.loadSession()).toEqual(work.loadSession());
    expect(home.forProfile('web')).toBe(home);
  });

  it('imports and restores history into its own profile', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    const row = {
      url: 'https://docs.example/',
      title: 'Docs',
      visitCount: 4,
      lastVisitedAt: 40,
    };
    expect(work.importHistory([row])).toEqual(['https://docs.example/']);
    expect(home.importHistory([row])).toEqual(['https://docs.example/']);
    work.forgetHistory(['https://docs.example/']);
    expect(work.listHistory('', 10)).toEqual([]);
    work.restoreHistory([row]);
    expect(work.listHistory('', 10)).toHaveLength(1);
    expect(home.listHistory('', 10)).toHaveLength(1);
  });

  it('forgets a deleted workspace’s profile and nothing else', () => {
    const home = memoryStore();
    const work = home.forProfile('ws-work');
    home.recordVisit('https://news.example/', 10);
    home.setPermission('https://news.example', 'sound', false);
    work.recordVisit('https://intranet.example/', 20);
    work.setPermission('https://intranet.example', 'popups', true);
    home.forgetProfile('ws-work');
    expect(work.listHistory('', 10)).toEqual([]);
    expect(work.listPermissions()).toEqual([]);
    expect(home.listHistory('', 10)).toHaveLength(1);
    expect(home.listPermissions()).toHaveLength(1);
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

  it('leaves a database from a newer version byte for byte untouched', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    const newer = new DatabaseSync(file);
    newer.exec("CREATE TABLE marker (x); INSERT INTO marker VALUES ('keep');");
    newer.exec('PRAGMA user_version = 999');
    newer.close();
    const before = readFileSync(file);
    expect(() => openTrailStore(file)).toThrow(/newer/);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(readdirSync(dir)).toEqual(['splash.db']);
  });

  it('persists across reopening', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    const first = openTrailStore(file).store;
    first.saveSession(SESSION);
    first.close();
    const second = openTrailStore(file);
    expect(second.recoveredFrom).toBeNull();
    expect(second.store.loadSession()).toEqual(STORED);
    second.store.close();
  });

  it('keeps a copy of an older database before upgrading it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    const older = new DatabaseSync(file);
    migrate(older, MIGRATIONS.slice(0, 1));
    older.exec("INSERT INTO preferences (key, value) VALUES ('kept', 'yes')");
    older.close();
    openTrailStore(file).store.close();
    const backup = new DatabaseSync(path.join(dir, 'splash.db.pre-v2'));
    expect(schemaVersion(backup)).toBe(1);
    expect(
      backup.prepare("SELECT value FROM preferences WHERE key = 'kept'").get(),
    ).toEqual({ value: 'yes' });
    backup.close();
  });

  it('keeps no copy of a new or current database', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splash-store-'));
    const file = path.join(dir, 'splash.db');
    openTrailStore(file).store.close();
    openTrailStore(file).store.close();
    expect(readdirSync(dir).filter((name) => name.includes('pre-v'))).toEqual(
      [],
    );
  });
});
