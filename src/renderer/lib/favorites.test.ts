// @vitest-environment jsdom
import type { SplashApi } from '../../shared/api';
import {
  DEFAULT_PREFERENCES,
  type SavedCollection,
} from '../../shared/preferences';
import { splitPartner } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { favoritesOf, moveFavorite } from './collections';

function collection(
  id: string,
  name: string,
  urls: string[],
  kind: SavedCollection['kind'] = 'folder',
): SavedCollection {
  return {
    id,
    name,
    kind,
    parentId: null,
    collapsed: false,
    links: urls.map((url) => ({ id: url, url, title: url })),
  };
}

function setup(collections: SavedCollection[] = []) {
  let preferences = { ...structuredClone(DEFAULT_PREFERENCES), collections };
  window.splash = {
    getPreferences: async () => preferences,
    updatePreferences: async (patch: Partial<typeof preferences>) => {
      preferences = { ...preferences, ...patch };
      return preferences;
    },
  } as unknown as SplashApi;
  return () => preferences.collections;
}

const urls = (items: SavedCollection[]) =>
  favoritesOf(items).map((favorite) => favorite.link.url);

describe('favorites', () => {
  it('lists every bookmarked address once, the main folder first', () => {
    expect(
      urls([
        collection('old', 'Reading', ['x', 'y']),
        collection('trip', 'Trip', ['z'], 'group'),
        collection('main', 'Bookmarks', ['y', 'w']),
      ]),
    ).toEqual(['y', 'w', 'x']);
  });
  it('moves a favorite into the main folder at its new place', async () => {
    const read = setup([
      collection('main', 'Bookmarks', ['a', 'b']),
      collection('old', 'Reading', ['c']),
    ]);
    await moveFavorite('c', 0);
    expect(urls(read())).toEqual(['c', 'a', 'b']);
    expect(read().find((item) => item.id === 'old')!.links).toEqual([]);
  });
});

describe('dropping a page beside another', () => {
  it('pairs it with the current page', () => {
    useShell.setState({ snapshot: sampleSnapshot() });
    expect(splitPartner('c', 'right')).toBe('a');
    expect(splitPartner('a', 'right')).toBeNull();
  });
  it('replaces one side of a split, or swaps the sides', () => {
    useShell.setState({
      snapshot: { ...sampleSnapshot(), split: { leftId: 'a', rightId: 'b' } },
    });
    expect(splitPartner('c', 'right')).toBe('a');
    expect(splitPartner('b', 'left')).toBe('a');
    expect(splitPartner('a', 'left')).toBeNull();
  });
});
