import type { PageListing } from './browser-controller';
import { buildPaletteItems, type PaletteInput } from './palette';

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

  it('shows nothing in the address bar until something is typed', () => {
    expect(buildPaletteItems(input({ scope: 'address' }))).toEqual([]);
  });
});
