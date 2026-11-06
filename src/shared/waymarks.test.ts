import {
  DEFAULT_SEARCH_SHORTCUTS,
  fillSearchUrl,
  isSearchKeyword,
  isSearchTemplate,
  MAX_SEARCH_SHORTCUTS,
  SEARCH_PLACEHOLDER,
} from './search';
import {
  findWaymarks,
  WAYMARK_CATEGORIES,
  WAYMARK_RESERVED_WORDS,
  WAYMARKS,
} from './waymarks';

describe('the Waymarks catalog', () => {
  it('has more than 200 sites, and room to add them all', () => {
    expect(WAYMARKS.length).toBeGreaterThan(200);
    expect(MAX_SEARCH_SHORTCUTS).toBeGreaterThan(WAYMARKS.length);
  });

  it('gives every site its own keyword and address', () => {
    expect(new Set(WAYMARKS.map((item) => item.keyword)).size).toBe(
      WAYMARKS.length,
    );
    expect(new Set(WAYMARKS.map((item) => item.url)).size).toBe(
      WAYMARKS.length,
    );
  });

  it.each(WAYMARKS.map((item) => [item.name, item] as const))(
    '%s can be saved as a shortcut',
    (_name, item) => {
      expect(isSearchKeyword(item.keyword)).toBe(true);
      expect(item.keyword).toBe(item.keyword.toLowerCase());
      expect(item.name.length).toBeLessThanOrEqual(60);
      expect(isSearchTemplate(item.url)).toBe(true);
      expect(item.url.split(SEARCH_PLACEHOLDER)).toHaveLength(2);
      expect(new URL(fillSearchUrl(item.url, 'a b')).protocol).toBe('https:');
    },
  );

  it('keeps keywords clear of everyday words a search might start with', () => {
    expect(
      WAYMARKS.filter((item) => WAYMARK_RESERVED_WORDS.has(item.keyword)),
    ).toEqual([]);
  });

  it('lists Splash’s default shortcuts, so a removed one can come back', () => {
    for (const shortcut of DEFAULT_SEARCH_SHORTCUTS) {
      expect(WAYMARKS.find((item) => item.url === shortcut.url)?.keyword).toBe(
        shortcut.keyword,
      );
    }
  });

  it('leaves no category empty', () => {
    for (const category of WAYMARK_CATEGORIES) {
      expect(findWaymarks('', category).length).toBeGreaterThan(0);
    }
  });
});

describe('findWaymarks', () => {
  it('finds by name, keyword, address or category, in any case', () => {
    expect(findWaymarks('IMDB').map((item) => item.keyword)).toContain('imdb');
    expect(findWaymarks('yt').map((item) => item.name)).toContain('YouTube');
    expect(findWaymarks('npmjs').map((item) => item.name)).toContain('npm');
    expect(findWaymarks('germany').length).toBeGreaterThan(10);
  });

  it('needs every word to match', () => {
    expect(findWaymarks('google flights').map((item) => item.name)).toEqual([
      'Google Flights',
    ]);
  });

  it('narrows to a category', () => {
    const names = findWaymarks('amazon', 'Germany').map((item) => item.name);
    expect(names).toEqual(['Amazon.de']);
  });

  it('returns everything for an empty search', () => {
    expect(findWaymarks('   ')).toHaveLength(WAYMARKS.length);
  });
});
