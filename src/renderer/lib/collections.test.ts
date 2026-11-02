// @vitest-environment jsdom
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { sampleSnapshot } from '../test-fixtures';
import { bookmarkPage, toggleBookmark, updateLibrary } from './collections';

describe('saved collections', () => {
  function setup() {
    let preferences = structuredClone(DEFAULT_PREFERENCES);
    const updatePreferences = vi.fn(async (patch) => {
      preferences = { ...preferences, ...patch };
      return preferences;
    });
    window.splash = {
      getPreferences: async () => preferences,
      updatePreferences,
    } as unknown as SplashApi;
    return { read: () => preferences, updatePreferences };
  }
  it('serializes overlapping saves and avoids duplicate bookmarks', async () => {
    const { read } = setup();
    const pages = sampleSnapshot().pages;
    await Promise.all([
      bookmarkPage(pages.a!),
      bookmarkPage(pages.b!),
      bookmarkPage(pages.a!),
    ]);
    expect(read().collections).toHaveLength(1);
    expect(read().collections[0]!.links.map((link) => link.url)).toEqual([
      pages.a!.url,
      pages.b!.url,
    ]);
  });
  it('removes a bookmark without deleting saved tab group links', async () => {
    const { read } = setup();
    const page = sampleSnapshot().pages.a!;
    await bookmarkPage(page);
    await updateLibrary((items) => [
      ...items,
      { ...items[0]!, id: crypto.randomUUID(), kind: 'group' },
    ]);
    await toggleBookmark(page);
    expect(read().collections[0]!.links).toHaveLength(0);
    expect(read().collections[1]!.links).toHaveLength(1);
  });
  it('reports failure and allows a later save to recover', async () => {
    const { updatePreferences, read } = setup();
    updatePreferences.mockRejectedValueOnce(new Error('Disk full'));
    expect(await updateLibrary(() => [])).toBe(false);
    await bookmarkPage(sampleSnapshot().pages.a!);
    expect(read().collections).toHaveLength(1);
  });
});
