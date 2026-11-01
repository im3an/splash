import type { PageListing } from './browser-controller';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { WorkspaceSummary } from '../../shared/types';
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
      'duckduckgo',
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
    expect(noPage).toContain('New page');
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
