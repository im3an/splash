import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  parseChromiumBookmarks,
  parseSafariBookmarks,
  parseSafariHistoryExport,
  readChromiumHistory,
  readFirefoxBookmarks,
  readFirefoxHistory,
  readSafariHistory,
} from './browser-formats';
import { loginOrigin, loginsToCsv, parseCsv, parseLoginCsv } from './login-csv';
import { parseBinaryPlist } from './plist';
import { branchOf, trailToMarkdown } from './trail-markdown';

describe('parseChromiumBookmarks', () => {
  it('reads its fixed folders in order', () => {
    const nodes = parseChromiumBookmarks(
      JSON.stringify({
        checksum: 'x',
        roots: {
          other: { type: 'folder', name: 'Other bookmarks', children: [] },
          bookmark_bar: {
            type: 'folder',
            name: 'Bookmarks bar',
            children: [
              { type: 'url', name: 'A', url: 'https://a.test/' },
              {
                type: 'folder',
                name: 'F',
                children: [{ type: 'url', name: 'B', url: 'https://b.test/' }],
              },
              { type: 'weird', name: 'skip' },
            ],
          },
        },
      }),
    );
    expect(nodes.map((node) => node.type === 'folder' && node.name)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
    ]);
    expect(nodes[0]).toMatchObject({
      children: [
        { title: 'A', url: 'https://a.test/' },
        { name: 'F', children: [{ title: 'B' }] },
      ],
    });
  });
});

describe('history databases', () => {
  it('converts Chromium times and drops what can’t be a page', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE urls (url TEXT, title TEXT, visit_count INT, last_visit_time INT, hidden INT)',
    );
    const insert = db.prepare('INSERT INTO urls VALUES (?,?,?,?,?)');
    insert.run('https://a.test/', 'A', 3, 13_300_000_000_000_000, 0);
    insert.run('chrome://settings/', 'Settings', 1, 13_300_000_000_000_001, 0);
    insert.run('https://hidden.test/', 'H', 1, 13_300_000_000_000_002, 1);
    const rows = readChromiumHistory(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      url: 'https://a.test/',
      title: 'A',
      visitCount: 3,
      lastVisitedAt: 1_655_526_400_000,
    });
  });

  it('reads Firefox places, bookmarks and folders, not tags', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INT, last_visit_date INT, hidden INT);
      CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INT, fk INT, parent INT, position INT, title TEXT, guid TEXT);
      INSERT INTO moz_places VALUES (1,'https://a.test/','A',2,1700000000000000,0);
      INSERT INTO moz_places VALUES (2,'https://b.test/','B',0,NULL,0);
      INSERT INTO moz_places VALUES (3,'place:type=6','',1,1700000000000000,1);
      INSERT INTO moz_bookmarks VALUES (1,2,NULL,0,0,'','root________');
      INSERT INTO moz_bookmarks VALUES (2,2,NULL,1,0,'menu','menu________');
      INSERT INTO moz_bookmarks VALUES (3,2,NULL,1,1,'tags','tags________');
      INSERT INTO moz_bookmarks VALUES (4,1,1,2,0,'A title',NULL);
      INSERT INTO moz_bookmarks VALUES (5,2,NULL,2,1,'Folder',NULL);
      INSERT INTO moz_bookmarks VALUES (6,1,2,5,0,'B title',NULL);
      INSERT INTO moz_bookmarks VALUES (7,3,NULL,2,2,NULL,NULL);
      INSERT INTO moz_bookmarks VALUES (8,1,1,3,0,'a tag',NULL);
    `);
    expect(readFirefoxBookmarks(db)).toEqual([
      {
        type: 'folder',
        name: 'Bookmarks Menu',
        children: [
          { type: 'link', title: 'A title', url: 'https://a.test/' },
          {
            type: 'folder',
            name: 'Folder',
            children: [
              { type: 'link', title: 'B title', url: 'https://b.test/' },
            ],
          },
        ],
      },
    ]);
    expect(readFirefoxHistory(db)).toEqual([
      {
        url: 'https://a.test/',
        title: 'A',
        visitCount: 2,
        lastVisitedAt: 1_700_000_000_000,
      },
    ]);
  });

  it('reads Safari’s last visit and its title', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT, visit_count INT);
      CREATE TABLE history_visits (id INTEGER PRIMARY KEY, history_item INT, visit_time REAL, title TEXT);
      INSERT INTO history_items VALUES (1,'https://a.test/',5);
      INSERT INTO history_visits VALUES (1,1,700000000,'Old');
      INSERT INTO history_visits VALUES (2,1,700000100,'New');
    `);
    expect(readSafariHistory(db)).toEqual([
      {
        url: 'https://a.test/',
        title: 'New',
        visitCount: 5,
        lastVisitedAt: (700000100 + 978307200) * 1000,
      },
    ]);
  });

  it('reads Safari’s exported history', () => {
    expect(
      parseSafariHistoryExport(
        JSON.stringify({
          metadata: { data_type: 'history' },
          history: [
            {
              url: 'https://a.test/',
              title: 'A',
              time_usec: 1700000000000000,
              visit_count: 2,
            },
            { url: 'nonsense', time_usec: 1 },
          ],
        }),
      ),
    ).toEqual([
      {
        url: 'https://a.test/',
        title: 'A',
        visitCount: 2,
        lastVisitedAt: 1_700_000_000_000,
      },
    ]);
    expect(() => parseSafariHistoryExport('{}')).toThrow();
  });
});

describe.runIf(process.platform === 'darwin')('parseBinaryPlist', () => {
  it('reads a real binary plist as Safari writes one', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'plist-'));
    const file = path.join(folder, 'b.plist');
    writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
  <key>Children</key><array>
    <dict><key>WebBookmarkType</key><string>WebBookmarkTypeProxy</string><key>Title</key><string>History</string></dict>
    <dict><key>WebBookmarkType</key><string>WebBookmarkTypeList</string><key>Title</key><string>BookmarksBar</string>
      <key>Children</key><array>
        <dict><key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string>
          <key>URLString</key><string>https://a.test/</string>
          <key>URIDictionary</key><dict><key>title</key><string>Grüße ✓</string></dict>
          <key>Size</key><integer>70000</integer><key>Ok</key><true/>
        </dict>
      </array>
    </dict>
  </array>
</dict></plist>`,
    );
    execFileSync('plutil', ['-convert', 'binary1', file]);
    expect(parseSafariBookmarks(parseBinaryPlist(readFileSync(file)))).toEqual([
      {
        type: 'folder',
        name: 'Favorites',
        children: [{ type: 'link', title: 'Grüße ✓', url: 'https://a.test/' }],
      },
    ]);
  });

  it('refuses a file that isn’t one, and a truncated one', () => {
    expect(() => parseBinaryPlist(Buffer.from('nope'))).toThrow();
    const trailer = Buffer.alloc(40);
    trailer.write('bplist00');
    trailer[38 - 32 + 8] = 0;
    expect(() => parseBinaryPlist(trailer)).toThrow();
  });
});

describe('login CSV', () => {
  it('handles quotes, commas and line breaks', () => {
    expect(parseCsv('a,"b,""c""\nd",e\r\n\r\nf\n')).toEqual([
      ['a', 'b,"c"\nd', 'e'],
      ['f'],
    ]);
  });

  it.each([
    [
      'Chrome',
      'name,url,username,password,note\nA,https://a.test/login,me,secret,\n',
    ],
    [
      'Firefox',
      '"url","username","password","httpRealm","formActionOrigin","guid"\n"https://a.test","me","secret",,"https://a.test","{1}"\n',
    ],
    [
      'Safari',
      'Title,URL,Username,Password,Notes,OTPAuth\nA,https://a.test/,me,secret,,\n',
    ],
    [
      'Bitwarden',
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,A,,,0,https://a.test/,me,secret,\n,,note,N,,,0,,,,\n',
    ],
    ['1Password', 'Title,Url,Username,Password\nA,a.test,me,secret\n'],
  ])('reads %s’s export', (_name, csv) => {
    expect(parseLoginCsv(csv)?.logins).toEqual([
      { origin: 'https://a.test', username: 'me', password: 'secret' },
    ]);
  });

  it('refuses a file with no such columns', () => {
    expect(parseLoginCsv('a,b\n1,2\n')).toBeNull();
    expect(parseLoginCsv('')).toBeNull();
  });

  it('skips rows that can’t be a web login, and repeats', () => {
    const parsed = parseLoginCsv(
      'url,username,password\nandroid://x,a,b\nhttps://a.test,,\nhttps://a.test,me,1\nhttps://a.test/x,me,2\n',
    )!;
    expect(parsed.logins).toHaveLength(1);
    expect(parsed.skipped).toBe(3);
  });

  it('only takes web origins', () => {
    expect(loginOrigin('javascript:alert(1)')).toBeNull();
    expect(loginOrigin('file:///etc/passwd')).toBeNull();
    expect(loginOrigin('http://a.test:8080/x')).toBe('http://a.test:8080');
  });

  it('writes what it reads, and defuses spreadsheet formulas', () => {
    const logins = [
      { origin: 'https://a.test', username: 'a,"b"', password: 'p\nq' },
    ];
    expect(parseLoginCsv(loginsToCsv(logins))?.logins).toEqual(logins);
    expect(
      loginsToCsv([
        { origin: 'https://a.test', username: '=cmd()', password: 'x' },
      ]),
    ).toContain("'=cmd()");
  });
});

describe('trailToMarkdown', () => {
  const page = (id: string, parentId: string | null, extra = {}) => ({
    id,
    parentId,
    url: `https://${id}.test/`,
    title: id.toUpperCase(),
    customTitle: null,
    note: null,
    ...extra,
  });

  it('nests pages, keeps notes under them and escapes labels', () => {
    expect(
      trailToMarkdown('Trip', [
        page('a', null, { customTitle: 'My [page]' }),
        page('b', 'a', { note: 'first\nsecond' }),
        page('c', 'b', { url: 'https://c.test/a(1) b' }),
        page('d', null, { url: null, title: '' }),
      ]),
    ).toBe(`# Trip

- [My \\[page\\]](https://a.test/)
  - [B](https://b.test/)
    > first
    > second
    - [C](https://c.test/a%281%29%20b)
- New page
`);
  });

  it('picks out one branch', () => {
    const pages = [
      page('a', null),
      page('b', 'a'),
      page('c', 'b'),
      page('d', null),
    ];
    expect(branchOf(pages, 'b').map((p) => p.id)).toEqual(['b', 'c']);
  });
});
