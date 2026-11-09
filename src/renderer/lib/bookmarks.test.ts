// @vitest-environment jsdom
import type { SavedCollection } from '../../shared/preferences';
import {
  addLinks,
  bookmarkRows,
  branchLinks,
  createFolder,
  linksOf,
  moveItems,
  moveTargets,
  parseDroppedLink,
  removeItems,
  restoreItems,
  undoMove,
  type SavedLink,
} from './bookmarks';
import { sampleSnapshot } from '../test-fixtures';

const link = (id: string, title = id, url = `https://${id}.test/`) =>
  ({ id, title, url }) satisfies SavedLink;

function folder(
  id: string,
  name: string,
  links: SavedLink[] = [],
  parentId: string | null = null,
  collapsed = false,
): SavedCollection {
  return { id, name, kind: 'folder', parentId, collapsed, links };
}

const library = () => [
  folder('main', 'Bookmarks', [link('a'), link('b')]),
  folder('work', 'Work', [link('c')]),
  folder('docs', 'Docs', [link('d')], 'work'),
  folder('trip', 'Trip', [], null, true),
];

describe('bookmarkRows', () => {
  it('lists folders first, nested, then loose links', () => {
    expect(
      bookmarkRows(library(), '').map((row) => [row.id, row.depth]),
    ).toEqual([
      ['work', 0],
      ['docs', 1],
      ['d', 2],
      ['c', 1],
      ['trip', 0],
      ['a', 0],
      ['b', 0],
    ]);
  });

  it('never shows the main folder as a folder', () => {
    const ids = bookmarkRows(library(), '').map((row) => row.id);
    expect(ids).not.toContain('main');
  });

  it('hides what a collapsed folder holds', () => {
    const items = library().map((item) =>
      item.id === 'work' ? { ...item, collapsed: true } : item,
    );
    expect(bookmarkRows(items, '').map((row) => row.id)).toEqual([
      'work',
      'trip',
      'a',
      'b',
    ]);
  });

  it('counts everything a folder holds, nested too', () => {
    const work = bookmarkRows(library(), '').find((row) => row.id === 'work');
    expect(work?.kind === 'folder' && work.count).toBe(2);
  });

  it('searches titles, addresses and folder names, across collapsed folders', () => {
    const items = [
      folder('main', 'Bookmarks', [link('a', 'Apples')]),
      folder(
        'work',
        'Work',
        [link('c', 'Plans', 'https://apples.test/')],
        null,
        true,
      ),
      folder('apple', 'Apple notes', []),
    ];
    const rows = bookmarkRows(items, ' APPLE ');
    expect(rows.map((row) => row.id)).toEqual(['apple', 'c', 'a']);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
    expect(rows[1]).toMatchObject({ folderName: 'Work' });
  });

  it('ignores anything that is not a folder', () => {
    const items = [
      ...library(),
      { ...folder('g', 'Group', [link('z')]), kind: 'group' as const },
    ];
    expect(bookmarkRows(items, '').map((row) => row.id)).not.toContain('z');
  });
});

describe('addLinks', () => {
  it('adds to a named folder and reports how many were new', () => {
    const { items, added } = addLinks(library(), 'work', [
      link('new'),
      link('other', 'Copy', 'https://c.test/'),
    ]);
    expect(added).toBe(1);
    expect(
      items.find((item) => item.id === 'work')?.links.map((l) => l.id),
    ).toEqual(['c', 'new']);
  });

  it('makes the main folder when there is none', () => {
    const { items, added } = addLinks([], null, [link('a')]);
    expect(added).toBe(1);
    expect(items[0]).toMatchObject({ name: 'Bookmarks', kind: 'folder' });
  });

  it('does not take a nested folder called Bookmarks for the main one', () => {
    const { items } = addLinks(
      [folder('work', 'Work'), folder('nested', 'Bookmarks', [], 'work')],
      null,
      [link('a')],
    );
    expect(items.find((item) => item.id === 'nested')?.links).toEqual([]);
    expect(items).toHaveLength(3);
  });

  it('adds nothing when the folder has gone', () => {
    const { items, added } = addLinks(library(), 'gone', [link('new')]);
    expect(added).toBe(0);
    expect(items).toEqual(library());
  });
});

describe('createFolder', () => {
  it('adds an empty folder inside its parent', () => {
    const items = createFolder(library(), 'New', 'Reading', 'work');
    expect(items.at(-1)).toMatchObject({
      id: 'New',
      name: 'Reading',
      parentId: 'work',
      links: [],
    });
  });
});

describe('moveItems', () => {
  it('moves links and folders together', () => {
    const items = moveItems(
      library(),
      { linkIds: ['a'], folderIds: ['trip'] },
      'work',
    );
    expect(
      items.find((item) => item.id === 'main')?.links.map((l) => l.id),
    ).toEqual(['b']);
    expect(
      items.find((item) => item.id === 'work')?.links.map((l) => l.id),
    ).toEqual(['c', 'a']);
    expect(items.find((item) => item.id === 'trip')?.parentId).toBe('work');
  });

  it('moves to the top level, making the main folder if needed', () => {
    const items = moveItems(
      [folder('work', 'Work', [link('c')]), folder('docs', 'Docs', [], 'work')],
      { linkIds: ['c'], folderIds: ['docs'] },
      null,
    );
    expect(items.find((item) => item.id === 'docs')?.parentId).toBeNull();
    expect(
      items.find((item) => item.name === 'Bookmarks')?.links.map((l) => l.id),
    ).toEqual(['c']);
  });

  it('keeps what a moving folder holds inside it', () => {
    const items = moveItems(
      library(),
      { linkIds: ['c', 'd'], folderIds: ['work', 'docs'] },
      'trip',
    );
    expect(items.find((item) => item.id === 'work')?.parentId).toBe('trip');
    expect(items.find((item) => item.id === 'docs')?.parentId).toBe('work');
    expect(linksOf(items, 'work').map((l) => l.id)).toEqual(['c']);
    expect(linksOf(items, 'trip')).toEqual([]);
  });

  it('never puts a folder inside itself', () => {
    const items = moveItems(
      library(),
      { linkIds: [], folderIds: ['work'] },
      'docs',
    );
    expect(items.find((item) => item.id === 'work')?.parentId).toBeNull();
  });

  it('drops the moved copy when the target already holds that address', () => {
    const items = moveItems(
      [
        folder('main', 'Bookmarks', [link('x', 'One', 'https://same.test/')]),
        folder('work', 'Work', [link('y', 'Two', 'https://same.test/')]),
      ],
      { linkIds: ['x'], folderIds: [] },
      'work',
    );
    expect(linksOf(items, 'work').map((l) => l.id)).toEqual(['y']);
    expect(linksOf(items, 'main')).toEqual([]);
  });
});

describe('undoMove', () => {
  const selection = { linkIds: ['a'], folderIds: ['trip'] };

  it('puts links and folders back where they were', () => {
    const before = library();
    const moved = moveItems(before, selection, 'work');
    expect(undoMove(moved, before, selection)).toEqual(before);
  });

  it('keeps what was added since', () => {
    const before = library();
    const moved = moveItems(before, selection, 'work');
    const later = addLinks(moved, 'work', [link('new')]).items;
    const undone = undoMove(later, before, selection);
    expect(linksOf(undone, 'main').map((l) => l.id)).toEqual(['a', 'b']);
    expect(linksOf(undone, 'work').map((l) => l.id)).toEqual(['c', 'new']);
  });

  it('brings back a copy the move dropped as a duplicate', () => {
    const before = [
      folder('main', 'Bookmarks', [link('x', 'One', 'https://same.test/')]),
      folder('work', 'Work', [link('y', 'Two', 'https://same.test/')]),
    ];
    const items = { linkIds: ['x'], folderIds: [] };
    const moved = moveItems(before, items, 'work');
    expect(undoMove(moved, before, items)).toEqual(before);
  });
});

describe('moveTargets', () => {
  it('offers the top level and every folder, but not a moving branch', () => {
    const targets = moveTargets(library(), ['work']);
    expect(targets.map((target) => target.id)).toEqual([null, 'trip']);
  });
});

describe('removeItems and restoreItems', () => {
  it('removes a folder with everything inside it', () => {
    const { items } = removeItems(library(), {
      linkIds: [],
      folderIds: ['work'],
    });
    expect(items.map((item) => item.id)).toEqual(['main', 'trip']);
  });

  it('counts the bookmarks that went', () => {
    const { removed } = removeItems(library(), {
      linkIds: ['a'],
      folderIds: ['work'],
    });
    expect(removed.count).toBe(3);
  });

  it('puts everything back where it was', () => {
    const before = library();
    const { items, removed } = removeItems(before, {
      linkIds: ['a'],
      folderIds: ['work'],
    });
    expect(restoreItems(items, removed)).toEqual(before);
  });

  it('keeps changes made since, when undoing', () => {
    const { items, removed } = removeItems(library(), {
      linkIds: ['a'],
      folderIds: [],
    });
    const later = addLinks(items, 'trip', [link('new')]).items;
    const restored = restoreItems(later, removed);
    expect(linksOf(restored, 'main').map((l) => l.id)).toEqual(['a', 'b']);
    expect(linksOf(restored, 'trip').map((l) => l.id)).toEqual(['new']);
  });

  it('does not double up when undone twice', () => {
    const { items, removed } = removeItems(library(), {
      linkIds: ['a'],
      folderIds: ['trip'],
    });
    const once = restoreItems(items, removed);
    expect(restoreItems(once, removed)).toEqual(once);
  });
});

describe('branchLinks', () => {
  it('takes each web page once, in trail order', () => {
    const snapshot = sampleSnapshot();
    const urls = branchLinks(snapshot, 'a').map((l) => l.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toBe(snapshot.pages.a!.url);
  });

  it('skips pages with no web address', () => {
    const snapshot = sampleSnapshot();
    snapshot.pages.a = { ...snapshot.pages.a!, url: null };
    expect(branchLinks(snapshot, 'a').map((l) => l.url)).not.toContain(null);
  });
});

describe('parseDroppedLink', () => {
  const drop = (data: Record<string, string>) => (type: string) =>
    data[type] ?? '';

  it('reads a dragged link and its text', () => {
    expect(
      parseDroppedLink(
        drop({
          'text/uri-list': '# comment\nhttps://a.test/page\n',
          'text/html': '<a href="https://a.test/page"> The  page </a>',
        }),
      ),
    ).toEqual({ url: 'https://a.test/page', title: 'The page' });
  });

  it('takes an address typed or copied as text', () => {
    expect(
      parseDroppedLink(drop({ 'text/plain': '  https://a.test/x  ' })),
    ).toEqual({ url: 'https://a.test/x', title: 'a.test' });
    expect(parseDroppedLink(drop({ 'text/plain': 'a.test/x' }))).toEqual({
      url: 'https://a.test/x',
      title: 'a.test',
    });
  });

  it('turns down anything that is not a web address', () => {
    for (const text of [
      'just some words',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'plain',
      '',
    ]) {
      expect(parseDroppedLink(drop({ 'text/plain': text }))).toBeNull();
    }
    expect(
      parseDroppedLink(drop({ 'text/uri-list': 'file:///Users/me/a.pdf' })),
    ).toBeNull();
  });

  it('runs nothing from dragged markup', () => {
    const parsed = parseDroppedLink(
      drop({
        'text/uri-list': 'https://a.test/',
        'text/html':
          '<a href="https://a.test/"><img src=x onerror="window.hit=1">Hi</a>',
      }),
    );
    expect(parsed?.title).toBe('Hi');
    expect((window as unknown as { hit?: number }).hit).toBeUndefined();
  });
});
