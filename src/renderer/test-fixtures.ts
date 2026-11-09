import { DEFAULT_APPEARANCE } from '../shared/appearance';
import type { BrowserSnapshot, PageSnapshot } from '../shared/types';

export function page(
  id: string,
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return {
    id,
    parentId: null,
    childIds: [],
    url: `https://${id}.example/`,
    title: id,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    collapsed: false,
    error: null,
    isDiscarded: false,
    customTitle: null,
    note: null,
    isPinned: false,
    groupId: null,
    isAudible: false,
    isMuted: false,
    zoomPercent: 100,
    find: null,
    isUnresponsive: false,
    blockedPermissions: [],
    blockedPopups: [],
    shownElsewhere: false,
    permissionRequest: null,
    ...overrides,
  };
}

/** a → (b → d), c; e */
export function sampleSnapshot(
  overrides: Partial<Record<string, Partial<PageSnapshot>>> = {},
): BrowserSnapshot {
  const pages = [
    page('a', { childIds: ['b', 'c'], ...overrides.a }),
    page('b', { parentId: 'a', childIds: ['d'], ...overrides.b }),
    page('c', { parentId: 'a', ...overrides.c }),
    page('d', { parentId: 'b', ...overrides.d }),
    page('e', { ...overrides.e }),
  ];
  return {
    pages: Object.fromEntries(pages.map((p) => [p.id, p])),
    rootIds: ['a', 'e'],
    groups: [],
    activePageId: 'a',
    split: null,
    otherWindows: [],
    lastClosed: null,
    workspaces: [
      {
        id: 'w1',
        name: 'Personal',
        pageCount: pages.length,
        appearance: DEFAULT_APPEARANCE,
      },
    ],
    activeWorkspaceId: 'w1',
  };
}
