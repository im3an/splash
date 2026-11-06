import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
} from '../../shared/preferences';
import { SqliteTrailStore } from '../storage/sqlite-trail-store';
import { Vault } from '../vault/vault';
import { Transfer } from './transfer';

let home: string;
let store: SqliteTrailStore;
let vault: Vault;
let preferences: Preferences;
let transfer: Transfer;
const trash = vi.fn(async () => undefined);

const urls = () => store.listHistory('', 100).map((row) => row.url);

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'splash-home-'));
  store = new SqliteTrailStore(new DatabaseSync(':memory:'));
  let id = 0;
  const createId = () =>
    `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`;
  vault = new Vault({
    store,
    cipher: {
      available: () => true,
      seal: (text) => Buffer.from(text),
      open: (sealed) => Buffer.from(sealed).toString(),
    },
    createId,
    now: () => 1,
  });
  preferences = { ...DEFAULT_PREFERENCES, collections: [] };
  trash.mockClear();
  transfer = new Transfer({
    home,
    scratch: tmpdir(),
    store,
    vault,
    preferences: {
      get: () => preferences,
      update: (patch) => (preferences = { ...preferences, ...patch }),
    },
    createId,
    trash,
  });
});

function makeChrome(folder = 'Google/Chrome') {
  const root = path.join(home, 'Library/Application Support', folder);
  mkdirSync(path.join(root, 'Default'), { recursive: true });
  writeFileSync(
    path.join(root, 'Local State'),
    JSON.stringify({ profile: { info_cache: { Default: { name: 'Work' } } } }),
  );
  writeFileSync(
    path.join(root, 'Default/Bookmarks'),
    JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          name: 'Bookmarks bar',
          children: [{ type: 'url', name: 'A', url: 'https://a.test/' }],
        },
      },
    }),
  );
  const db = new DatabaseSync(path.join(root, 'Default/History'));
  db.exec(
    'CREATE TABLE urls (url TEXT, title TEXT, visit_count INT, last_visit_time INT, hidden INT)',
  );
  db.prepare('INSERT INTO urls VALUES (?,?,?,?,?)').run(
    'https://h.test/',
    'H',
    4,
    13_300_000_000_000_000,
    0,
  );
  db.close();
}

describe('sources', () => {
  it('finds profiles with their given names, and nothing when nothing’s there', () => {
    expect(transfer.sources().filter((s) => s.browser !== 'Safari')).toEqual(
      [],
    );
    makeChrome();
    expect(transfer.sources().find((s) => s.browser === 'Chrome')).toEqual({
      id: 'chromium:Chrome:Default',
      browser: 'Chrome',
      profile: 'Work',
      hasBookmarks: true,
      hasHistory: true,
      blocked: false,
    });
  });
});

describe('importFrom', () => {
  it('brings over what was asked for, and only that', async () => {
    makeChrome();
    const result = await transfer.importFrom('chromium:Chrome:Default', {
      bookmarks: true,
      history: false,
    });
    expect(result.summary).toBe('Added 1 bookmark.');
    expect(preferences.collections.map((c) => c.name)).toEqual([
      'Imported from Chrome (Work)',
      'Bookmarks bar',
    ]);
    expect(urls()).toEqual([]);
  });

  it('adds nothing the second time, and undoes the first', async () => {
    makeChrome();
    const both = { bookmarks: true, history: true };
    const first = await transfer.importFrom('chromium:Chrome:Default', both);
    expect(first.summary).toBe('Added 1 bookmark and 1 history entry.');
    expect(urls()).toEqual(['https://h.test/']);
    const second = await transfer.importFrom('chromium:Chrome:Default', both);
    expect(second.summary).toBe('Nothing new: all of it is already in Splash.');
    expect(store.listHistory('', 1)[0]?.visitCount).toBe(4);
    expect(transfer.undo(first.undoToken!)).toBe(true);
    expect(preferences.collections).toEqual([]);
    expect(urls()).toEqual([]);
    expect(transfer.undo(first.undoToken!)).toBe(false);
  });

  it('doesn’t touch history that was there, on undo', async () => {
    makeChrome();
    store.recordVisit('https://h.test/', 5);
    const result = await transfer.importFrom('chromium:Chrome:Default', {
      bookmarks: false,
      history: true,
    });
    expect(result.undoToken).toBeNull();
    expect(urls()).toEqual(['https://h.test/']);
  });

  it('can read a database the browser has open', async () => {
    makeChrome('Vivaldi');
    const open = new DatabaseSync(
      path.join(home, 'Library/Application Support/Vivaldi/Default/History'),
    );
    open.exec('PRAGMA journal_mode = WAL');
    open
      .prepare('INSERT INTO urls VALUES (?,?,?,?,?)')
      .run('https://wal.test/', 'W', 1, 13_300_000_000_000_000, 0);
    const result = await transfer.importFrom('chromium:Vivaldi:Default', {
      bookmarks: false,
      history: true,
    });
    open.close();
    expect(result.summary).toBe('Added 2 history entries.');
    expect(urls()).toContain('https://wal.test/');
  });

  it('refuses a source that isn’t there', async () => {
    await expect(
      transfer.importFrom('chromium:Nope:Default', {
        bookmarks: true,
        history: true,
      }),
    ).rejects.toThrow();
  });
});

describe('importFile', () => {
  const html = `<DL><DT><H3>F</H3><DL><DT><A HREF="https://a.test/">A</A></DL></DL>`;

  it('reads a bookmark file', () => {
    const result = transfer.importFile('/x/bookmarks.html', strToU8(html));
    expect(result.summary).toBe('Added 1 bookmark.');
    expect(preferences.collections[0]?.name).toBe(
      'Imported from bookmarks.html',
    );
  });

  it('says so when a file has no bookmarks', () => {
    const result = transfer.importFile('/x/page.html', strToU8('<p>hi</p>'));
    expect(result.summary).toContain('No bookmarks found');
    expect(result.undoToken).toBeNull();
    expect(preferences.collections).toEqual([]);
  });

  it('reads passwords, warns about the file, and can trash just that file', async () => {
    const result = transfer.importFile(
      '/x/Passwords.csv',
      strToU8('name,url,username,password\nA,https://a.test/,me,secret\n'),
    );
    expect(result.summary).toBe('Added 1 login.');
    expect(result.details.join(' ')).toContain('unencrypted');
    expect(vault.findLogin('https://a.test', 'me')?.password).toBe('secret');
    expect(await transfer.trashFile(result.trashToken!)).toBe(true);
    expect(trash).toHaveBeenCalledWith('/x/Passwords.csv');
    expect(await transfer.trashFile(result.trashToken!)).toBe(false);
    expect(await transfer.trashFile('/etc/passwd')).toBe(false);
    expect(trash).toHaveBeenCalledOnce();
    transfer.undo(result.undoToken!);
    expect(vault.logins()).toEqual([]);
  });

  it('won’t take a CSV of something else for passwords', () => {
    const result = transfer.importFile('/x/a.csv', strToU8('a,b\n1,2\n'));
    expect(result.summary).toContain('isn’t a list of logins');
    expect(result.trashToken).toBeNull();
  });

  it('reads Safari’s whole export, and undoes it as one', () => {
    const zip = zipSync({
      'Safari Export/Bookmarks.html': strToU8(html),
      'Safari Export/History.json': strToU8(
        JSON.stringify({
          history: [
            {
              url: 'https://h.test/',
              title: 'H',
              time_usec: 1e15,
              visit_count: 1,
            },
          ],
        }),
      ),
      'Safari Export/Passwords.csv': strToU8(
        'Title,URL,Username,Password\nA,https://a.test/,me,secret\n',
      ),
      'Safari Export/ignored.bin': strToU8('x'),
    });
    const result = transfer.importFile('/x/Safari Export.zip', zip);
    expect(result.summary).toContain('1 bookmark');
    expect(result.summary).toContain('1 history entry');
    expect(result.summary).toContain('1 login');
    transfer.undo(result.undoToken!);
    expect(preferences.collections).toEqual([]);
    expect(urls()).toEqual([]);
    expect(vault.logins()).toEqual([]);
  });

  it('reads a history JSON on its own', () => {
    const result = transfer.importFile(
      '/x/History.json',
      strToU8(
        JSON.stringify({
          metadata: {},
          history: [{ url: 'https://h.test/', time_usec: 1e15 }],
        }),
      ),
    );
    expect(result.summary).toBe('Added 1 history entry.');
  });

  it('fails plainly on a damaged file', () => {
    expect(() =>
      transfer.importFile('/x/Bookmarks.json', strToU8('{not json')),
    ).toThrow();
    expect(() => transfer.importFile('/x/b.plist', strToU8('nope'))).toThrow();
  });
});
