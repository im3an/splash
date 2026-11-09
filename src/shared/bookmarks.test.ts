import { bookmarkLinks, folderTree, subfolders } from './bookmarks';
import type { SavedCollection } from './preferences';

function folder(
  id: string,
  name: string,
  parentId: string | null,
  urls: string[] = [],
  kind: SavedCollection['kind'] = 'folder',
): SavedCollection {
  return {
    id,
    name,
    kind,
    parentId,
    collapsed: false,
    links: urls.map((url) => ({ id: `${id}:${url}`, title: url, url })),
  };
}

const LIBRARY = [
  folder('main', 'Bookmarks', null, ['https://top.example/']),
  folder('work', 'Work', null, ['https://work.example/']),
  folder('deep', 'Deep', 'work', ['https://deep.example/']),
  folder('under-main', 'Reading', 'main', ['https://reading.example/']),
  folder('lost', 'Lost', 'gone', ['https://lost.example/']),
  folder('group', 'A saved group', null, ['https://group.example/'], 'group'),
];

describe('bookmarkLinks', () => {
  it('walks nested folders and names the folder holding each link', () => {
    expect(
      bookmarkLinks(LIBRARY).map(({ link, folderName }) => [
        link.url,
        folderName,
      ]),
    ).toEqual([
      ['https://work.example/', 'Work'],
      ['https://deep.example/', 'Deep'],
      ['https://reading.example/', 'Reading'],
      ['https://lost.example/', 'Lost'],
      // The main folder is the top level, not a folder to name.
      ['https://top.example/', null],
    ]);
  });

  it('leaves out saved groups, which are not bookmarks', () => {
    const urls = bookmarkLinks(LIBRARY).map(({ link }) => link.url);
    expect(urls).not.toContain('https://group.example/');
  });

  it('copes with an empty library', () => {
    expect(bookmarkLinks([])).toEqual([]);
  });
});

describe('the folder tree', () => {
  it('lists what sits at a place, with the main folder as the top level', () => {
    expect(subfolders(LIBRARY, null).map((item) => item.id)).toEqual([
      'work',
      'under-main',
      'lost',
    ]);
    expect(subfolders(LIBRARY, 'work').map((item) => item.id)).toEqual([
      'deep',
    ]);
    expect(subfolders(LIBRARY, 'deep')).toEqual([]);
  });

  it('puts each folder after its parent, a level deeper', () => {
    expect(
      folderTree(LIBRARY).map(({ folder: item, depth }) => [item.id, depth]),
    ).toEqual([
      ['work', 0],
      ['deep', 1],
      ['under-main', 0],
      ['lost', 0],
    ]);
  });
});
