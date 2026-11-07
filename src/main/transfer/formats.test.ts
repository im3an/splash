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
import {
  branchOf,
  groupPages,
  parseTrailOutline,
  trailFileName,
  trailToMarkdown,
} from './trail-markdown';

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

describe('parseTrailOutline', () => {
  it('reads back what a trail exports', () => {
    const pages = [
      {
        id: 'a',
        parentId: null,
        url: 'https://example.com/a_(b)',
        title: 'A [draft]',
        customTitle: null,
        note: 'first line\nsecond line',
        emoji: '🐎',
      },
      {
        id: 'b',
        parentId: 'a',
        url: 'https://example.com/b',
        title: 'B',
        customTitle: null,
        note: null,
      },
      {
        id: 'c',
        parentId: 'b',
        url: null,
        title: '',
        customTitle: 'Just a name',
        note: null,
      },
    ];
    const outline = parseTrailOutline(trailToMarkdown('Trip', pages));
    expect(outline.title).toBe('Trip');
    expect(outline.pageCount).toBe(3);
    expect(outline.skippedAddresses).toBe(0);
    expect(outline.items).toEqual([
      {
        label: 'A [draft]',
        url: 'https://example.com/a_%28b%29',
        note: 'first line\nsecond line',
        emoji: '🐎',
        children: [
          {
            label: 'B',
            url: 'https://example.com/b',
            note: null,
            emoji: null,
            children: [
              {
                label: 'Just a name',
                url: null,
                note: null,
                emoji: null,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('reads outlines people wrote by hand', () => {
    const { items, title } = parseTrailOutline(
      [
        'Some words before the list.',
        '',
        '* [Plain](https://a.example/x_(y)) - worth a look',
        '\t1. https://b.example/path',
        '\t2. <https://c.example>',
        '+ [ ] [Task](https://d.example "A title")',
        'See [this] in the text.',
        'https://e.example between lists',
      ].join('\r\n'),
    );
    expect(title).toBeNull();
    expect(items.map((item) => [item.label, item.url, item.note])).toEqual([
      ['Plain', 'https://a.example/x_(y)', 'worth a look'],
      ['Task', 'https://d.example', null],
      ['', 'https://e.example', 'between lists'],
    ]);
    expect(items[0]!.children.map((item) => item.url)).toEqual([
      'https://b.example/path',
      'https://c.example',
    ]);
  });

  it('nests under later headings, and takes the first as the title', () => {
    const { title, items } = parseTrailOutline(
      [
        '# Plans',
        '## Reading',
        '- [One](https://one.example)',
        '### Later',
        '- [Two](https://two.example)',
        '## Watching',
        '- [Three](https://three.example)',
      ].join('\n'),
    );
    expect(title).toBe('Plans');
    expect(items.map((item) => item.label)).toEqual(['Reading', 'Watching']);
    expect(items[0]!.children.map((item) => item.label)).toEqual([
      'One',
      'Later',
    ]);
    expect(items[0]!.children[1]!.children[0]!.label).toBe('Two');
  });

  it('never takes an address that could run or read something', () => {
    const outline = parseTrailOutline(
      [
        '- [Run](javascript:alert(1))',
        '- [Local](file:///etc/passwd)',
        '- [Data](data:text/html,hi)',
        '- [Fine](https://fine.example)',
      ].join('\n'),
    );
    expect(outline.skippedAddresses).toBe(3);
    expect(outline.items.map((item) => [item.label, item.url])).toEqual([
      ['Run', null],
      ['Local', null],
      ['Data', null],
      ['Fine', 'https://fine.example'],
    ]);
  });

  it('finds nothing in text with no outline', () => {
    expect(
      parseTrailOutline('Just a sentence.\n\nAnd another.').pageCount,
    ).toBe(0);
    expect(parseTrailOutline('').pageCount).toBe(0);
    expect(parseTrailOutline('- \n* [](javascript:x)').pageCount).toBe(0);
  });

  it('survives a broken link', () => {
    const { items } = parseTrailOutline('- [never closed](https://a.example');
    expect(items[0]!.label).toBe('[never closed](https://a.example');
    expect(items[0]!.url).toBeNull();
  });
});

describe('groupPages', () => {
  it('takes a group’s trails with what is beneath them', () => {
    const page = (id: string, parentId: string | null, groupId?: string) => ({
      id,
      parentId,
      groupId,
      url: null,
      title: id,
      customTitle: null,
      note: null,
    });
    const pages = [
      page('a', null, 'g'),
      page('a1', 'a'),
      page('b', null),
      page('b1', 'b'),
      page('c', null, 'g'),
    ];
    expect(groupPages(pages, 'g').map((item) => item.id)).toEqual([
      'a',
      'a1',
      'c',
    ]);
  });
});

describe('trailFileName', () => {
  it('makes a name a file can have', () => {
    expect(trailFileName('A/B: "C"')).toBe('A B   C.md');
    expect(trailFileName('../../secret')).toBe('secret.md');
    expect(trailFileName('   ')).toBe('Trail.md');
    expect(trailFileName('x\u0000y\nz')).toBe('x y z.md');
  });
});
