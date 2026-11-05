import { describe, expect, it } from 'vitest';
import { preferencesSchema } from './ipc';
import { DEFAULT_PREFERENCES, normalizeHomepage } from './preferences';
import {
  commandOnly,
  customEngines,
  defaultEngine,
  DEFAULT_SEARCH_SHORTCUTS,
  fillSearchUrl,
  isSearchTemplate,
  keywordOnly,
  keywordSearch,
  normalizeShortcut,
  scopedInput,
  scopeEntry,
  shortcutOrigin,
  shortcutProblem,
} from './search';

const shortcuts = DEFAULT_SEARCH_SHORTCUTS;

describe('keywordSearch', () => {
  it('finds the shortcut and the words after it', () => {
    expect(keywordSearch('yt cats and dogs', shortcuts)).toEqual({
      shortcut: expect.objectContaining({ name: 'YouTube' }),
      query: 'cats and dogs',
    });
  });

  it('ignores case and extra spaces', () => {
    expect(keywordSearch('  YT   cats ', shortcuts)?.query).toBe('cats');
  });

  it('needs both a known keyword and some words', () => {
    expect(keywordSearch('yt', shortcuts)).toBeNull();
    expect(keywordSearch('yt  ', shortcuts)).toBeNull();
    expect(keywordSearch('nope cats', shortcuts)).toBeNull();
    expect(keywordSearch('cats yt', shortcuts)).toBeNull();
  });
});

describe('commandOnly', () => {
  it('recognises !yt and /yt, not yt', () => {
    expect(commandOnly('!yt', shortcuts)?.name).toBe('YouTube');
    expect(commandOnly('/YT', shortcuts)?.name).toBe('YouTube');
    expect(commandOnly('yt', shortcuts)).toBeNull();
    expect(commandOnly('!yt cats', shortcuts)).toBeNull();
    expect(commandOnly('/users/me', shortcuts)).toBeNull();
  });
});

describe('scopeEntry', () => {
  it('starts on the keyword and a space', () => {
    for (const text of ['!yt ', '/yt ', 'yt ', '!YT ']) {
      expect(scopeEntry(text, shortcuts)).toEqual({
        shortcut: expect.objectContaining({ name: 'YouTube' }),
        rest: '',
      });
    }
  });

  it('keeps words pasted after the keyword', () => {
    expect(scopeEntry('!yt cats dogs', shortcuts)?.rest).toBe('cats dogs');
  });

  it('waits for the space, so !g can still become !gh', () => {
    expect(scopeEntry('!g', shortcuts)).toBeNull();
    expect(scopeEntry('!gh ', shortcuts)?.shortcut.name).toBe('GitHub');
  });

  it('leaves other text alone', () => {
    expect(scopeEntry('how to bake', shortcuts)).toBeNull();
    expect(scopeEntry(' yt ', shortcuts)).toBeNull();
    expect(scopeEntry('https://example.com/ ', shortcuts)).toBeNull();
  });
});

it('turns a scoped field back into a line to resolve', () => {
  const youtube = shortcuts.find((item) => item.keyword === 'yt')!;
  expect(scopedInput(youtube, 'cats')).toBe('!yt cats');
  expect(scopedInput(youtube, '')).toBe('!yt');
  expect(shortcutOrigin(youtube)).toBe('https://www.youtube.com');
});

describe('keywordOnly', () => {
  it('recognises a keyword typed alone', () => {
    expect(keywordOnly('yt', shortcuts)?.name).toBe('YouTube');
    expect(keywordOnly('yt cats', shortcuts)).toBeNull();
  });
});

describe('fillSearchUrl', () => {
  it('encodes the words, wherever the placeholder sits', () => {
    expect(fillSearchUrl('https://a.example/%s/x?q=%s', 'a&b c')).toBe(
      'https://a.example/a%26b%20c/x?q=a%26b%20c',
    );
  });

  it('leaves replacement patterns in the words alone', () => {
    expect(fillSearchUrl('https://a.example/?q=%s', "$&$'")).toBe(
      "https://a.example/?q=%24%26%24'",
    );
  });
});

describe('isSearchTemplate', () => {
  it('takes web addresses with a placeholder', () => {
    expect(isSearchTemplate('https://a.example/?q=%s')).toBe(true);
    expect(isSearchTemplate('http://localhost:3000/%s')).toBe(true);
  });

  it('refuses anything that could reach further than the web', () => {
    expect(isSearchTemplate('https://a.example/')).toBe(false);
    expect(isSearchTemplate('javascript:alert("%s")')).toBe(false);
    expect(isSearchTemplate('file:///etc/%s')).toBe(false);
    expect(isSearchTemplate('chrome://settings/%s')).toBe(false);
    expect(isSearchTemplate('%s')).toBe(false);
  });
});

describe('shortcutProblem', () => {
  const good = { name: 'Maps', keyword: 'm', url: 'maps.example/?q=%s' };

  it('accepts a good shortcut and adds the scheme when saving', () => {
    expect(shortcutProblem(good, shortcuts)).toBeNull();
    expect(
      normalizeShortcut({ name: ' Maps ', keyword: ' M ', url: good.url }),
    ).toEqual({
      name: 'Maps',
      keyword: 'm',
      url: 'https://maps.example/?q=%s',
    });
  });

  it('says what is wrong', () => {
    expect(shortcutProblem({ ...good, name: ' ' }, shortcuts)).toMatch(/name/);
    expect(shortcutProblem({ ...good, keyword: '' }, shortcuts)).toMatch(
      /keyword/,
    );
    expect(shortcutProblem({ ...good, keyword: 'a b' }, shortcuts)).toMatch(
      /one word/,
    );
    expect(shortcutProblem({ ...good, keyword: '!m' }, shortcuts)).toMatch(
      /one word/,
    );
    expect(shortcutProblem({ ...good, keyword: 'YT' }, shortcuts)).toBe(
      '“yt” already searches YouTube.',
    );
    expect(
      shortcutProblem({ ...good, url: 'maps.example' }, shortcuts),
    ).toMatch(/%s/);
    expect(
      shortcutProblem({ ...good, url: 'javascript:go("%s")' }, shortcuts),
    ).toMatch(/web address/);
  });
});

describe('the default engine', () => {
  const custom = {
    id: 'kagi',
    name: 'Kagi',
    keyword: 'k',
    url: 'https://kagi.com/search?q=%s',
  };

  it('can be a built-in engine or a shortcut', () => {
    const searchShortcuts = [...shortcuts, custom];
    expect(
      defaultEngine({ searchEngine: 'google', searchShortcuts }).name,
    ).toBe('Google');
    expect(defaultEngine({ searchEngine: 'kagi', searchShortcuts }).name).toBe(
      'Kagi',
    );
  });

  it('falls back when its shortcut has gone', () => {
    expect(
      defaultEngine({ searchEngine: 'kagi', searchShortcuts: shortcuts }).name,
    ).toBe('DuckDuckGo');
  });

  it('lists only shortcuts the built-in engines do not cover', () => {
    const search = {
      searchEngine: 'google',
      searchShortcuts: [...shortcuts, custom],
    };
    expect(customEngines(search).map((item) => item.name)).toEqual([
      'YouTube',
      'Wikipedia',
      'GitHub',
      'Kagi',
    ]);
  });
});

describe('the preferences schema', () => {
  const parse = (searchShortcuts: unknown[]) =>
    preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, searchShortcuts })
      .success;
  const item = {
    id: 'a',
    name: 'A',
    keyword: 'a',
    url: 'https://a.example/%s',
  };

  it('accepts the default shortcuts', () => {
    expect(parse([...shortcuts])).toBe(true);
  });

  it('refuses unsafe addresses and repeated keywords', () => {
    expect(parse([{ ...item, url: 'javascript:alert("%s")' }])).toBe(false);
    expect(parse([item, { ...item, id: 'b' }])).toBe(false);
  });
});

describe('normalizeHomepage', () => {
  it('fills in the scheme', () => {
    expect(normalizeHomepage('example.com')).toBe('https://example.com/');
    expect(normalizeHomepage(' http://example.com/a ')).toBe(
      'http://example.com/a',
    );
    expect(normalizeHomepage('localhost:3000')).toBe('https://localhost:3000/');
  });

  it('refuses what is not a web address', () => {
    for (const text of [
      '',
      'not an address',
      'example',
      'file:///etc/hosts',
      'javascript://x.y/%0aalert(1)',
      'chrome://settings',
    ]) {
      expect(normalizeHomepage(text)).toBeNull();
    }
  });
});
