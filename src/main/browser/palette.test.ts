import type { PageListing } from './browser-controller';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { SavedCollection } from '../../shared/preferences';
import type { PaletteItem, WorkspaceSummary } from '../../shared/types';
import type { HistoryMatch } from '../storage/trail-store';
import {
  buildPaletteItems,
  matchScore,
  searchSuggestionItems,
  visitedAgo,
  type ActivePageFacts,
  type PaletteInput,
} from './palette';

function listing(
  id: string,
  title: string,
  url: string | null,
  overrides: Partial<PageListing> = {},
): PageListing {
  return {
    id,
    workspaceId: 'w1',
    workspaceName: 'Personal',
    title,
    url,
    faviconUrl: null,
    note: null,
    pinned: false,
    lastActiveAt: 1,
    ...overrides,
  };
}

const PAGES = [
  listing('a', 'Trail running guide', 'https://trails.example/guide', {
    lastActiveAt: 5,
  }),
  listing('b', 'Quarterly plan', 'https://docs.example/q3', {
    workspaceId: 'w2',
    workspaceName: 'Work',
    note: 'budget review',
  }),
  listing('c', '', 'https://news.example/', { lastActiveAt: 9 }),
];

function input(overrides: Partial<PaletteInput>): PaletteInput {
  return {
    query: '',
    scope: 'palette',
    pages: PAGES,
    history: [],
    activeWorkspaceId: 'w1',
    activePageId: null,
    ...overrides,
  };
}

const WORKSPACES: WorkspaceSummary[] = [
  { id: 'w1', name: 'Personal', pageCount: 2, appearance: DEFAULT_APPEARANCE },
  { id: 'w2', name: 'Work', pageCount: 1, appearance: DEFAULT_APPEARANCE },
];

function activePage(overrides: Partial<ActivePageFacts> = {}): ActivePageFacts {
  return {
    id: 'c',
    url: 'https://news.example/',
    pinned: false,
    muted: false,
    hasChildren: false,
    hasNote: false,
    ...overrides,
  };
}

function saved(
  id: string,
  name: string,
  links: [title: string, url: string][],
  parentId: string | null = null,
  kind: SavedCollection['kind'] = 'folder',
): SavedCollection {
  return {
    id,
    name,
    kind,
    parentId,
    collapsed: false,
    links: links.map(([title, url]) => ({ id: `${id}:${url}`, title, url })),
  };
}

const NOW = 1_000_000_000_000;

function visited(url: string, title: string, visitCount = 1): HistoryMatch {
  return { url, title, visitCount, lastVisitedAt: NOW, faviconUrl: null };
}

describe('bookmark results', () => {
  const LIBRARY = [
    saved('main', 'Bookmarks', [['Rust book', 'https://rust.example/book']]),
    saved('work', 'Work', [['Invoices', 'https://billing.example/invoices']]),
    saved(
      'deep',
      'Tax 2026',
      [['Filing guide', 'https://tax.example/guide']],
      'work',
    ),
    saved(
      'group',
      'Saved',
      [['Grouped', 'https://grouped.example/']],
      null,
      'group',
    ),
  ];
  const find = (overrides: Partial<PaletteInput>) =>
    buildPaletteItems(input({ collections: LIBRARY, now: NOW, ...overrides }));
  const kinds = (items: PaletteItem[]) => items.map((item) => item.kind);

  it('finds a bookmark in the palette by title or address', () => {
    for (const query of ['rust book', 'rust.example']) {
      expect(
        find({ query }).find((item) => item.kind === 'bookmark'),
      ).toMatchObject({
        section: 'bookmarks',
        title: 'Rust book',
        url: 'https://rust.example/book',
      });
    }
  });

  it('leads with going to an address, even a saved one', () => {
    expect(find({ query: 'rust.example' })[0]?.id).toBe('navigate');
  });

  it('does not repeat an address typed out in full', () => {
    for (const scope of ['palette', 'address'] as const) {
      const items = find({ query: 'https://rust.example/book', scope });
      expect(items.map((item) => item.id)).toContain('navigate');
      expect(kinds(items)).not.toContain('bookmark');
    }
  });

  it('leads with the bookmark for words that are not an address', () => {
    expect(find({ query: 'rust book' })[0]?.kind).toBe('bookmark');
  });

  it('finds bookmarks in nested folders and says which folder', () => {
    const [first] = find({ query: 'filing' });
    expect(first).toMatchObject({
      title: 'Filing guide',
      subtitle: 'tax.example · Bookmark in Tax 2026',
    });
  });

  it('names no folder for the top level', () => {
    const [first] = find({ query: 'rust' });
    expect(first?.subtitle).toBe('rust.example · Bookmark');
  });

  it('does not treat a saved group as bookmarks', () => {
    expect(kinds(find({ query: 'grouped' }))).not.toContain('bookmark');
  });

  it('does not match a bookmark on its folder name', () => {
    expect(kinds(find({ query: 'tax 2026' }))).not.toContain('bookmark');
  });

  it('offers no bookmarks before typing, or among commands', () => {
    expect(kinds(find({ query: '' }))).not.toContain('bookmark');
    expect(kinds(find({ query: '>rust' }))).not.toContain('bookmark');
    expect(kinds(find({ query: '', scope: 'address' }))).toEqual([]);
  });

  it('copes with no library', () => {
    expect(
      kinds(find({ query: 'rust', collections: undefined })),
    ).not.toContain('bookmark');
  });

  it('caps the section', () => {
    const many = [
      saved(
        'main',
        'Bookmarks',
        Array.from({ length: 9 }, (_, index): [string, string] => [
          `Rust ${index}`,
          `https://rust${index}.example/`,
        ]),
      ),
    ];
    const items = find({ query: 'rust', collections: many });
    expect(kinds(items).filter((kind) => kind === 'bookmark')).toHaveLength(5);
  });

  it('keeps an open page ahead of an equal bookmark', () => {
    const items = find({
      query: 'trail',
      collections: [
        saved('main', 'Bookmarks', [['Trail maps', 'https://maps.example/']]),
      ],
    });
    expect(items.map((item) => item.title).slice(0, 2)).toEqual([
      'Trail running guide',
      'Trail maps',
    ]);
  });

  it('leads with a bookmark that matches better than any page', () => {
    const items = find({
      query: 'guide',
      collections: [
        saved('main', 'Bookmarks', [['Guide dogs', 'https://dogs.example/']]),
      ],
    });
    expect(items[0]?.title).toBe('Guide dogs');
  });

  it('keeps a command ahead of a bookmark with the same words', () => {
    const items = find({
      query: 'settings',
      collections: [
        saved('main', 'Bookmarks', [['Settings', 'https://s.example/']]),
      ],
    });
    expect(kinds(items).slice(0, 2)).toEqual(['command', 'bookmark']);
  });

  it('keeps bookmarks ahead of history in the palette', () => {
    const items = find({
      query: 'rust',
      history: [visited('https://rust.example/news', 'Rust news', 50)],
    });
    expect(
      kinds(items).filter((kind) => kind === 'bookmark' || kind === 'history'),
    ).toEqual(['bookmark', 'history']);
  });

  it('does not repeat a bookmark as history', () => {
    for (const scope of ['palette', 'address'] as const) {
      const items = find({
        query: 'rust',
        scope,
        history: [visited('http://www.rust.example/book', 'Rust book')],
      });
      expect(kinds(items).filter((kind) => kind === 'history')).toEqual([]);
      expect(kinds(items).filter((kind) => kind === 'bookmark')).toHaveLength(
        1,
      );
    }
  });

  it('does not repeat a bookmark beside its open page', () => {
    const pages = [listing('r', 'Rust book', 'https://rust.example/book')];
    for (const scope of ['palette', 'address'] as const) {
      const items = find({ query: 'rust book', scope, pages });
      expect(kinds(items)).toContain('page');
      expect(kinds(items)).not.toContain('bookmark');
    }
  });

  it("knows a bookmark's open page after a redirect", () => {
    const pages = [listing('r', 'Rust book', 'https://www.rust.example/book/')];
    const items = find({ query: 'rust book', pages });
    expect(kinds(items)).toContain('page');
    expect(kinds(items)).not.toContain('bookmark');
  });

  it('does not repeat a bookmark as a visit after a redirect', () => {
    const items = find({
      query: 'rust',
      history: [visited('https://rust.example/book/', 'Rust book')],
    });
    expect(kinds(items)).not.toContain('history');
  });

  it('finds a bookmark by its own name when the open page reads otherwise', () => {
    const pages = [listing('b', 'Sign in', 'https://login.example/')];
    const collections = [
      saved('main', 'Bookmarks', [['My bank', 'https://login.example/']]),
    ];
    const items = find({ query: 'bank', pages, collections });
    expect(items[0]).toMatchObject({ kind: 'bookmark', title: 'My bank' });
  });

  it('still shows the bookmark of the page on screen', () => {
    const pages = [listing('r', 'Rust book', 'https://rust.example/book')];
    const items = find({ query: 'rust book', pages, activePageId: 'r' });
    expect(items[0]?.kind).toBe('bookmark');
  });

  describe('in the address bar', () => {
    const address = (overrides: Partial<PaletteInput>) =>
      find({ scope: 'address', ...overrides });

    it('leaves the first row to what was typed', () => {
      const items = address({ query: 'rust' });
      expect(items[0]?.id).toBe('navigate');
      expect(items[1]).toMatchObject({
        kind: 'bookmark',
        url: 'https://rust.example/book',
      });
    });

    it('does not repeat the address a completion leads to', () => {
      const items = address({
        query: 'rust.ex',
        complete: true,
        collections: [
          saved('main', 'Bookmarks', [['Rust', 'https://rust.example/']]),
        ],
        history: [visited('https://rust.example/', 'Rust')],
      });
      expect(items[0]?.id).toBe('complete');
      expect(kinds(items)).not.toContain('bookmark');
    });

    it('ranks a good bookmark above a page visited once', () => {
      const items = address({
        query: 'rust',
        history: [visited('https://other.example/rust-notes', 'Rust notes')],
      });
      expect(kinds(items).slice(1, 3)).toEqual(['bookmark', 'history']);
    });

    it('ranks a site in daily use above a weak bookmark', () => {
      const items = address({
        query: 'git',
        collections: [
          saved('main', 'Bookmarks', [
            ['Digital archive', 'https://a.example/'],
          ]),
        ],
        history: [visited('https://github.com/', 'GitHub', 64)],
      });
      expect(items.slice(1, 3).map((item) => item.title)).toEqual([
        'GitHub',
        'Digital archive',
      ]);
    });

    it('shares its rows with history rather than growing the list', () => {
      const items = address({
        query: 'rust',
        collections: [
          saved(
            'main',
            'Bookmarks',
            Array.from({ length: 4 }, (_, index): [string, string] => [
              `Rust ${index}`,
              `https://saved${index}.example/`,
            ]),
          ),
        ],
        history: Array.from({ length: 6 }, (_, index) =>
          visited(`https://seen${index}.example/rust`, `Rust seen ${index}`),
        ),
      });
      expect(
        kinds(items).filter(
          (kind) => kind === 'bookmark' || kind === 'history',
        ),
      ).toHaveLength(6);
    });
  });
});

describe('buildPaletteItems', () => {
  it('offers recent pages and common commands before typing', () => {
    const items = buildPaletteItems(input({ activePageId: 'c' }));
    expect(items.filter((i) => i.kind === 'page').map((i) => i.title)).toEqual([
      'Trail running guide',
      'Quarterly plan',
    ]);
    expect(items.some((i) => i.kind === 'command')).toBe(true);
  });

  it('finds pages in any workspace by title, address or note', () => {
    const items = buildPaletteItems(input({ query: 'budget' }));
    expect(items[0]).toMatchObject({
      kind: 'page',
      pageId: 'b',
      workspaceName: 'Work',
    });
    expect(
      buildPaletteItems(input({ query: 'trails.example' }))[1],
    ).toMatchObject({ pageId: 'a' });
  });

  it('labels untitled pages by host', () => {
    const items = buildPaletteItems(input({ query: 'news' }));
    expect(items[0]).toMatchObject({ kind: 'page', title: 'news.example' });
  });

  it('matches commands by keyword', () => {
    const items = buildPaletteItems(input({ query: 'undo' }));
    expect(items[0]).toMatchObject({
      kind: 'command',
      command: 'reopen-closed',
      shortcut: '⇧⌘T',
    });
  });

  it('puts “go to” first for addresses and search last for words', () => {
    expect(buildPaletteItems(input({ query: 'example.org' }))[0]).toMatchObject(
      {
        kind: 'navigate',
        title: 'Go to example.org',
      },
    );
    const items = buildPaletteItems(input({ query: 'quarterly' }));
    expect(items.at(-1)).toMatchObject({
      kind: 'navigate',
      title: 'Search for “quarterly”',
    });
  });

  it('suggests history for the address bar, skipping open pages', () => {
    const items = buildPaletteItems(
      input({
        scope: 'address',
        query: 'docs',
        history: [
          {
            url: 'https://docs.example/q3',
            title: 'Quarterly plan',
            visitCount: 3,
            lastVisitedAt: 1,
          },
          {
            url: 'https://docs.example/api',
            title: 'API',
            visitCount: 1,
            lastVisitedAt: 2,
          },
        ],
      }),
    );
    expect(items.map((i) => i.kind)).toEqual(['navigate', 'history', 'page']);
    expect(items[1]).toMatchObject({ url: 'https://docs.example/api' });
    expect(items.some((i) => i.kind === 'command')).toBe(false);
  });

  it('shows a site’s icon on rows that go to it, not on searches', () => {
    const history = [
      {
        url: 'https://www.youtube.com/',
        title: 'YouTube',
        visitCount: 4,
        lastVisitedAt: 1,
        faviconUrl: 'https://www.youtube.com/favicon.ico',
      },
      {
        url: 'https://www.youtube.com/feed/library',
        title: 'Library',
        visitCount: 1,
        lastVisitedAt: 2,
      },
    ];
    const palette = buildPaletteItems(
      input({ scope: 'palette', query: 'youtube.com', history }),
    );
    expect(palette[0]).toMatchObject({
      kind: 'navigate',
      faviconUrl: 'https://www.youtube.com/favicon.ico',
    });
    // A visit that kept no icon borrows its site's.
    expect(
      palette
        .filter((item) => item.kind === 'history')
        .map((item) => (item.kind === 'history' ? item.faviconUrl : null)),
    ).toEqual([
      'https://www.youtube.com/favicon.ico',
      'https://www.youtube.com/favicon.ico',
    ]);

    const search = buildPaletteItems(
      input({ scope: 'palette', query: 'youtube', history }),
    );
    expect(search.at(-1)).toMatchObject({
      kind: 'navigate',
      title: 'Search for “youtube”',
      faviconUrl: null,
    });
  });

  it('completes an address from history while typing forward', () => {
    const history = [
      {
        url: 'https://github.com/',
        title: 'GitHub',
        visitCount: 8,
        lastVisitedAt: 1,
      },
      {
        url: 'https://github.com/anthropics',
        title: 'Anthropic',
        visitCount: 1,
        lastVisitedAt: 1,
      },
    ];
    const items = buildPaletteItems(
      input({ scope: 'address', query: 'gi', history, complete: true }),
    );
    expect(items.slice(0, 2)).toMatchObject([
      {
        kind: 'navigate',
        input: 'https://github.com/',
        completion: 'github.com',
        title: 'GitHub',
      },
      { kind: 'navigate', title: 'Search for “gi”' },
    ]);
    // The completed address isn't repeated as history.
    expect(
      items.filter((i) => i.kind === 'history').map((i) => i.title),
    ).toEqual(['Anthropic']);

    const typedOut = buildPaletteItems(
      input({ scope: 'address', query: 'github.com', history, complete: true }),
    );
    expect(typedOut.filter((i) => i.kind === 'navigate')).toHaveLength(1);

    const deleting = buildPaletteItems(
      input({ scope: 'address', query: 'gi', history }),
    );
    expect(deleting[0]).toMatchObject({ title: 'Search for “gi”' });
    expect(deleting[0]).not.toHaveProperty('completion');
  });

  it('never completes in the command palette', () => {
    const items = buildPaletteItems(
      input({
        query: 'gi',
        complete: true,
        history: [
          {
            url: 'https://github.com/',
            title: 'GitHub',
            visitCount: 8,
            lastVisitedAt: 1,
          },
        ],
      }),
    );
    expect(items.some((i) => i.kind === 'navigate' && i.completion)).toBe(
      false,
    );
  });

  it('turns engine suggestions into search rows', () => {
    const items = searchSuggestionItems(
      ['Weather', 'weather berlin', 'weather radar'],
      'weather',
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'search',
        title: 'weather berlin',
        url: 'https://duckduckgo.com/?q=weather%20berlin',
      }),
      expect.objectContaining({ title: 'weather radar' }),
    ]);
  });

  it('names the shortcut a keyword searches, ahead of everything else', () => {
    for (const scope of ['palette', 'location', 'address'] as const) {
      expect(buildPaletteItems(input({ query: 'yt cats', scope }))[0]).toEqual(
        expect.objectContaining({
          kind: 'navigate',
          input: 'yt cats',
          title: 'Search YouTube for “cats”',
          subtitle: 'www.youtube.com',
        }),
      );
    }
  });

  it('mentions the shortcut while only its keyword is typed', () => {
    expect(
      buildPaletteItems(input({ query: 'yt', scope: 'address' }))[0],
    ).toMatchObject({
      title: 'Search for “yt”',
      subtitle: 'DuckDuckGo · add words to search YouTube',
    });
  });

  it('shows nothing in the address bar until something is typed', () => {
    expect(buildPaletteItems(input({ scope: 'address' }))).toEqual([]);
  });

  it('leads with the search in the location field', () => {
    const items = buildPaletteItems(
      input({ scope: 'location', query: 'quarterly' }),
    );
    expect(items[0]).toMatchObject({
      kind: 'navigate',
      title: 'Search for “quarterly”',
    });
    expect(items.length).toBeGreaterThan(1);
  });

  it('groups results into sections, pinned pages first', () => {
    const items = buildPaletteItems(
      input({
        pages: [
          ...PAGES,
          listing('p', 'Inbox', 'https://mail.example/', { pinned: true }),
        ],
        workspaces: WORKSPACES,
        activePageId: 'c',
        activePage: activePage(),
      }),
    );
    expect([...new Set(items.map((i) => i.section))]).toEqual([
      'pinned',
      'pages',
      'workspaces',
      'commands',
    ]);
    expect(items[0]).toMatchObject({ kind: 'page', pageId: 'p' });
    // A pinned page shows once, in its own section.
    expect(items.filter((i) => i.id === 'page:p')).toHaveLength(1);
  });

  it('offers the other workspaces with their shortcuts', () => {
    const items = buildPaletteItems(input({ workspaces: WORKSPACES }));
    const workspaces = items.filter((i) => i.kind === 'workspace');
    expect(workspaces).toEqual([
      expect.objectContaining({
        workspaceId: 'w2',
        title: 'Work',
        subtitle: '1 page',
        shortcut: '⌃2',
      }),
    ]);
    expect(
      buildPaletteItems(input({ query: 'work', workspaces: WORKSPACES }))[0],
    ).toMatchObject({ kind: 'workspace', workspaceId: 'w2' });
  });

  it('leads with the section of the best match', () => {
    const items = buildPaletteItems(
      input({ query: 'settings', activePage: activePage() }),
    );
    expect(items[0]).toMatchObject({
      kind: 'command',
      command: 'open-settings',
    });
  });

  it('names toggles by what they will do, and hides what cannot apply', () => {
    const pinnedAndMuted = buildPaletteItems(
      input({
        query: '>',
        activePage: activePage({ pinned: true, muted: true }),
      }),
    ).map((i) => i.title);
    expect(pinnedAndMuted).toContain('Unpin page');
    expect(pinnedAndMuted).toContain('Unmute page');
    expect(pinnedAndMuted).not.toContain('Close branch');

    const noPage = buildPaletteItems(input({ query: '>' })).map((i) => i.title);
    expect(noPage).toContain('New blank page');
    expect(noPage).not.toContain('Pin page');
    expect(noPage).not.toContain('Reload page');

    const alone = buildPaletteItems(
      input({ query: '>', activePage: activePage() }),
    ).map((i) => i.title);
    expect(alone).not.toContain('Close other pages');
    expect(alone).not.toContain('Close split view');
    expect(alone).not.toContain('Delete workspace');
    expect(alone).toContain('Back');
    expect(alone).toContain('Print page');

    const busy = buildPaletteItems(
      input({
        query: '>',
        workspaces: WORKSPACES,
        activePage: activePage({ hasOthers: true, inSplit: true }),
      }),
    ).map((i) => i.title);
    expect(busy).toContain('Close other pages');
    expect(busy).toContain('Close split view');
    expect(busy).toContain('Delete workspace');
  });

  it('offers Close pages below only when pages are below', () => {
    const titles = (hasBelow: boolean) =>
      buildPaletteItems(
        input({ query: '>', activePage: activePage({ hasBelow }) }),
      ).map((i) => i.title);
    expect(titles(false)).not.toContain('Close pages below');
    expect(titles(true)).toContain('Close pages below');
  });

  it('finds the view and developer commands by name, with their shortcuts', () => {
    const row = (query: string, page = activePage()) =>
      buildPaletteItems(input({ query, activePage: page })).find(
        (item) => item.kind === 'command',
      );
    expect(row('source')).toMatchObject({
      title: 'View page source',
      shortcut: '⌥⌘U',
    });
    expect(row('inspect')).toMatchObject({
      title: 'Developer tools',
      shortcut: '⌥⌘I',
    });
    expect(row('filter')).toMatchObject({
      title: 'Filter pages',
      shortcut: '⌥⌘F',
    });
    expect(row('ai')).toMatchObject({
      title: 'Toggle AI panel',
      shortcut: '⇧⌘A',
    });
  });

  it('offers page source for web pages only', () => {
    const titles = (url: string | null) =>
      buildPaletteItems(
        input({ query: '>', activePage: activePage({ url }) }),
      ).map((i) => i.title);
    expect(titles('https://example.com/')).toContain('View page source');
    expect(titles('view-source:https://example.com/')).not.toContain(
      'View page source',
    );
    expect(titles(null)).not.toContain('View page source');
    expect(titles(null)).not.toContain('Developer tools');
    expect(titles(null)).toContain('Filter pages');
  });

  it('shows the shortcut for Show downloads', () => {
    const [row] = buildPaletteItems(input({ query: '>downloads' }));
    expect(row).toMatchObject({ title: 'Show downloads', shortcut: '⌥⌘L' });
  });

  it('offers Reopen closed only when something was closed', () => {
    const titles = (canReopen: boolean) =>
      buildPaletteItems(input({ query: '>', canReopen })).map((i) => i.title);
    expect(titles(true)).toContain('Reopen closed');
    expect(titles(false)).not.toContain('Reopen closed');
  });

  it('narrows to commands after “>”', () => {
    const items = buildPaletteItems(
      input({ query: '> pin', activePage: activePage() }),
    );
    expect(items.every((i) => i.kind === 'command')).toBe(true);
    expect(items[0]).toMatchObject({ command: 'pin-page', shortcut: '⌘D' });
  });

  it('says when history was visited', () => {
    const items = buildPaletteItems(
      input({
        query: 'api',
        now: 3 * 86_400_000,
        history: [
          {
            url: 'https://docs.example/api',
            title: 'API',
            visitCount: 1,
            lastVisitedAt: 0,
          },
        ],
      }),
    );
    expect(items.find((i) => i.kind === 'history')?.subtitle).toBe(
      'docs.example · 3 days ago',
    );
  });
});

describe('matchScore', () => {
  it('weighs a title match above the same match elsewhere', () => {
    const title = matchScore(
      [
        ['Plan', 2],
        ['https://x.example/', 1],
      ],
      ['plan'],
    );
    const address = matchScore(
      [
        ['Docs', 2],
        ['https://plan.example/', 1],
      ],
      ['plan'],
    );
    expect(title).toBeGreaterThan(address);
  });

  it('counts only word starts in keyword lists', () => {
    expect(matchScore([['url address share', 1, true]], ['res'])).toBe(0);
    expect(matchScore([['url address share', 1, true]], ['sha'])).toBe(2);
    expect(matchScore([['url address share', 1]], ['res'])).toBe(1);
  });

  it('needs every word to match somewhere', () => {
    expect(matchScore([['Trail guide', 2]], ['trail', 'map'])).toBe(0);
  });
});

describe('visitedAgo', () => {
  it('says recent visits plainly', () => {
    const now = 400 * 86_400_000;
    expect(visitedAgo(now - 30_000, now)).toBe('Just now');
    expect(visitedAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(visitedAgo(now - 86_400_000, now)).toBe('Yesterday');
    expect(visitedAgo(now - 14 * 86_400_000, now)).toBe('2 weeks ago');
    expect(visitedAgo(0, now)).toBe('Over a year ago');
  });
});
