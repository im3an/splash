import { describe, expect, it } from 'vitest';
import {
  countLinks,
  libraryTree,
  mergeBookmarks,
  withoutFolder,
  type BookmarkNode,
} from './bookmark-tree';

function ids() {
  let next = 0;
  return () => `id-${next++}`;
}

const link = (url: string, title = url): BookmarkNode => ({
  type: 'link',
  title,
  url,
});

describe('mergeBookmarks', () => {
  it('puts everything in one new folder, keeping nesting', () => {
    const merged = mergeBookmarks(
      [],
      [
        { type: 'folder', name: 'Work', children: [link('https://a.test/')] },
        link('https://b.test/'),
      ],
      'Imported from Chrome',
      ids(),
    );
    expect(merged.added).toBe(2);
    const root = merged.collections.find((c) => c.id === merged.rootId)!;
    expect(root.name).toBe('Imported from Chrome');
    expect(root.parentId).toBeNull();
    expect(root.links.map((l) => l.url)).toEqual(['https://b.test/']);
    const work = merged.collections.find((c) => c.name === 'Work')!;
    expect(work.parentId).toBe(root.id);
    expect(work.links.map((l) => l.url)).toEqual(['https://a.test/']);
  });

  it('leaves out addresses already in the library, and repeats', () => {
    const existing = [
      {
        id: 'keep',
        name: 'Bookmarks',
        kind: 'folder' as const,
        collapsed: false,
        parentId: null,
        links: [{ id: 'l', title: 'A', url: 'https://a.test/' }],
      },
    ];
    const merged = mergeBookmarks(
      existing,
      [
        link('https://a.test/'),
        link('https://b.test/'),
        link('https://b.test/'),
      ],
      'Imported',
      ids(),
    );
    expect(merged.added).toBe(1);
    expect(merged.duplicates).toBe(2);
    expect(merged.collections[0]).toEqual(existing[0]);
  });

  it('refuses bookmarklets and local files', () => {
    const merged = mergeBookmarks(
      [],
      [link('javascript:alert(1)'), link('file:///etc/passwd'), link('nope')],
      'Imported',
      ids(),
    );
    expect(merged.unsupported).toBe(3);
    expect(merged.added).toBe(0);
    expect(merged.collections).toEqual([]);
  });

  it('drops folders that end up empty, however deep', () => {
    const merged = mergeBookmarks(
      [],
      [
        {
          type: 'folder',
          name: 'Empty',
          children: [{ type: 'folder', name: 'Also empty', children: [] }],
        },
        link('https://a.test/'),
      ],
      'Imported',
      ids(),
    );
    expect(merged.collections.map((c) => c.name)).toEqual(['Imported']);
  });

  it('names a link without a title after its host', () => {
    const merged = mergeBookmarks(
      [],
      [{ type: 'link', title: ' ', url: 'https://a.test/x' }],
      'Imported',
      ids(),
    );
    expect(merged.collections[0]!.links[0]!.title).toBe('a.test');
  });

  it('counts what is past the library limit instead of failing', () => {
    const existing = Array.from({ length: 2000 }, (_, index) => ({
      id: `c${index}`,
      name: 'F',
      kind: 'folder' as const,
      collapsed: true,
      parentId: null,
      links: [],
    }));
    const merged = mergeBookmarks(
      existing,
      [link('https://a.test/')],
      'I',
      ids(),
    );
    expect(merged.overLimit).toBe(1);
    expect(merged.collections).toHaveLength(2000);
  });
});

describe('withoutFolder', () => {
  it('takes the folder and all beneath it, nothing else', () => {
    const merged = mergeBookmarks(
      [
        {
          id: 'keep',
          name: 'Keep',
          kind: 'folder',
          collapsed: false,
          parentId: null,
          links: [],
        },
      ],
      [
        {
          type: 'folder',
          name: 'F',
          children: [
            {
              type: 'folder',
              name: 'G',
              children: [link('https://a.test/')],
            },
          ],
        },
      ],
      'Imported',
      ids(),
    );
    expect(merged.collections).toHaveLength(4);
    expect(
      withoutFolder(merged.collections, merged.rootId).map((c) => c.id),
    ).toEqual(['keep']);
  });
});

describe('libraryTree', () => {
  it('unwraps the Bookmarks folder and leaves out page groups', () => {
    const tree = libraryTree([
      {
        id: 'b',
        name: 'Bookmarks',
        kind: 'folder',
        collapsed: false,
        parentId: null,
        links: [{ id: 'l', title: 'A', url: 'https://a.test/' }],
      },
      {
        id: 'f',
        name: 'Bookmarks',
        kind: 'folder',
        collapsed: false,
        parentId: 'b',
        links: [],
      },
      {
        id: 'g',
        name: 'A group',
        kind: 'group',
        collapsed: false,
        parentId: null,
        links: [{ id: 'm', title: 'G', url: 'https://g.test/' }],
      },
    ]);
    expect(tree).toEqual([
      { type: 'link', title: 'A', url: 'https://a.test/' },
      { type: 'folder', name: 'Bookmarks', children: [] },
    ]);
    expect(countLinks(tree)).toBe(1);
  });
});
