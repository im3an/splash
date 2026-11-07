/*
 * PROTOTYPE, throw away. Made-up trails for judging the graph at a known
 * density, whatever happens to be open. Nothing here can be opened.
 */
import type { PageId, PageSnapshot } from '../../shared/types';
import type { GraphData } from './alma-view-scene';

type Flag = 'asleep' | 'loading' | 'audio' | 'muted' | 'error' | 'pinned';
type Row = [url: string, title: string, children?: Row[], flags?: Flag[]];

const TRAILS: Row[] = [
  [
    'github.com/electron/electron',
    'electron/electron',
    [
      [
        'electronjs.org/docs/latest/api/web-contents-view',
        'WebContentsView',
        [
          ['electronjs.org/docs/latest/api/base-window', 'BaseWindow'],
          [
            'electronjs.org/docs/latest/api/web-contents',
            'webContents',
            [
              [
                'developer.mozilla.org/en-US/docs/Web/API/Window/open',
                'Window.open()',
              ],
              ['developer.mozilla.org/en-US/docs/Web/Security', 'Web security'],
            ],
          ],
          [
            'electronjs.org/docs/latest/tutorial/security',
            'Security checklist',
          ],
        ],
      ],
      [
        'github.com/electron/electron/issues',
        'Issues',
        [
          [
            'github.com/electron/electron/issues/40212',
            'View bounds wrong after resize',
          ],
          [
            'github.com/electron/electron/issues/41877',
            'Focus lost on overlay',
            [
              [
                'stackoverflow.com/questions/78112',
                'Keep focus in a child view',
              ],
              [
                'stackoverflow.com/questions/77204',
                'BrowserView vs WebContentsView',
              ],
            ],
          ],
        ],
      ],
      [
        'github.com/electron/electron/releases',
        'Releases',
        undefined,
        ['asleep'],
      ],
    ],
  ],
  [
    'wikipedia.org/wiki/Graph_drawing',
    'Graph drawing',
    [
      [
        'wikipedia.org/wiki/Force-directed_graph_drawing',
        'Force-directed drawing',
        [
          ['d3js.org/d3-force', 'd3-force'],
          ['observablehq.com/@d3/force-directed-graph', 'Force-directed graph'],
          [
            'wikipedia.org/wiki/Barnes-Hut_simulation',
            'Barnes-Hut simulation',
            [['arxiv.org/abs/1212.1121', 'Fast multipole methods']],
          ],
        ],
      ],
      [
        'wikipedia.org/wiki/Tree_layout',
        'Tree layouts',
        [
          ['d3js.org/d3-hierarchy/tree', 'Tidy tree'],
          ['d3js.org/d3-hierarchy/cluster', 'Dendrogram'],
        ],
      ],
      [
        'obsidian.md/graph',
        'Graph view',
        [
          ['help.obsidian.md/plugins/graph', 'Graph view help'],
          [
            'forum.obsidian.md/t/local-graph',
            'Local graph tips',
            undefined,
            ['asleep'],
          ],
        ],
      ],
    ],
  ],
  [
    'idealo.de/preisvergleich/Liste/espressomaschinen',
    'Espressomaschinen',
    [
      [
        'idealo.de/preisvergleich/OffersOfProduct/2011',
        'Siebträger A',
        undefined,
        ['asleep'],
      ],
      [
        'idealo.de/preisvergleich/OffersOfProduct/2873',
        'Siebträger B',
        undefined,
        ['asleep'],
      ],
      [
        'kaffee-netz.de/threads/einsteiger',
        'Einsteiger-Thread',
        [
          ['kaffee-netz.de/threads/muehlen', 'Mühlen im Vergleich'],
          [
            'youtube.com/watch?v=espresso-basics',
            'Espresso basics',
            undefined,
            ['audio'],
          ],
        ],
      ],
      ['amazon.de/dp/B0EXAMPLE1', 'Handmühle', undefined, ['asleep']],
    ],
  ],
  [
    'youtube.com/feed/subscriptions',
    'Subscriptions',
    [
      [
        'youtube.com/watch?v=trail-ui',
        'Designing browser sidebars',
        undefined,
        ['muted'],
      ],
      [
        'youtube.com/watch?v=typography',
        'Interface typography',
        [['fonts.google.com/knowledge', 'Google Fonts Knowledge']],
      ],
    ],
    ['asleep'],
  ],
  [
    'mail.google.com/mail/u/0',
    'Inbox',
    [
      ['docs.google.com/document/d/roadmap', 'Roadmap notes'],
      ['calendar.google.com/calendar/u/0/r', 'Calendar', undefined, ['asleep']],
    ],
    ['pinned'],
  ],
  [
    'vite.dev/guide',
    'Vite guide',
    [
      [
        'vite.dev/config',
        'Config reference',
        [['rollupjs.org/configuration-options', 'Rollup options']],
      ],
      [
        'github.com/vitejs/vite/discussions',
        'Discussions',
        undefined,
        ['loading'],
      ],
    ],
  ],
  [
    'news.ycombinator.com',
    'Hacker News',
    [
      [
        'news.ycombinator.com/item?id=41',
        'Show HN: a trail browser',
        [['browser.horse', 'Horse']],
      ],
      [
        'staging.nothing-here.example',
        'Couldn’t reach this site',
        undefined,
        ['error'],
      ],
    ],
  ],
  [
    'tailwindcss.com/docs/theme',
    'Theme variables',
    [
      ['github.com/electron/electron', 'electron/electron'],
      ['wikipedia.org/wiki/Graph_drawing', 'Graph drawing'],
    ],
  ],
  ['d3js.org/d3-force', 'd3-force'],
  ['react.dev/reference/react/useSyncExternalStore', 'useSyncExternalStore'],
  [
    'figma.com/design/splash-graph',
    'Splash graph sketches',
    undefined,
    ['pinned'],
  ],
];

function makePage(
  id: PageId,
  parentId: PageId | null,
  url: string,
  title: string,
  flags: Flag[],
): PageSnapshot {
  const has = (flag: Flag) => flags.includes(flag);
  return {
    id,
    parentId,
    childIds: [],
    url: `https://${url}`,
    title,
    faviconUrl: null,
    isLoading: has('loading'),
    canGoBack: false,
    canGoForward: false,
    collapsed: false,
    error: has('error')
      ? {
          kind: 'load-failed',
          code: -105,
          description: 'ERR_NAME_NOT_RESOLVED',
          url: `https://${url}`,
        }
      : null,
    isDiscarded: has('asleep'),
    shownElsewhere: false,
    customTitle: null,
    note: null,
    isPinned: has('pinned'),
    groupId: null,
    isAudible: has('audio') || has('muted'),
    isMuted: has('muted'),
    zoomPercent: 100,
    find: null,
    isUnresponsive: false,
    blockedPermissions: [],
    blockedPopups: [],
    permissionRequest: null,
  };
}

/** `copies` above 1 repeats the trails, to see where the graph gives out. */
export function sampleData(copies: number): GraphData {
  const pages: Record<PageId, PageSnapshot> = {};
  const rootIds: PageId[] = [];
  let serial = 0;
  const add = (row: Row, parentId: PageId | null): PageId => {
    const [url, title, children, flags] = row;
    const id = `sample-${serial++}`;
    pages[id] = makePage(id, parentId, url, title, flags ?? []);
    pages[id].childIds = (children ?? []).map((child) => add(child, id));
    return id;
  };
  for (let copy = 0; copy < copies; copy++) {
    for (const row of TRAILS) rootIds.push(add(row, null));
  }
  // Some trails filed, some loose, as in a real workspace.
  rootIds.forEach((id, i) => {
    pages[id]!.groupId =
      i % 4 === 0 ? 'sample-reading' : i % 4 === 1 ? 'sample-work' : null;
  });
  // Deep in the first trail, so the current page has ancestry to show.
  const active = Object.values(pages).find(
    (page) => page.title === 'Keep focus in a child view',
  );
  return {
    pages,
    rootIds,
    activePageId: active?.id ?? null,
    workspaceName: 'Sample',
    groups: [
      { id: 'sample-reading', name: 'Reading', collapsed: false },
      {
        id: 'sample-work',
        name: 'Work',
        collapsed: false,
        icon: { kind: 'emoji', value: '🔥' },
      },
    ],
    // Made up, but steady, so sizing and the Heaviest lens can be judged.
    memory: new Map(
      Object.values(pages)
        .filter((page) => !page.isDiscarded)
        .map((page, i) => [
          page.id,
          (40 + ((page.title.length * 97 + i * 53) % 860)) * 1e6,
        ]),
    ),
  };
}
