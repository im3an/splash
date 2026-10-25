import type {
  PageId,
  PaletteCommand,
  PaletteItem,
  WorkspaceId,
} from '../../shared/types';
import type { HistoryMatch } from '../storage/trail-store';
import type { PageListing } from './browser-controller';
import { resolveAddressInput, searchUrl } from './url';
import {
  DEFAULT_PREFERENCES,
  searchEngine,
  type SearchEngineId,
} from '../../shared/preferences';

interface CommandDefinition {
  command: PaletteCommand;
  title: string;
  keywords: string;
  shortcut: string | null;
}

/** Browser actions the palette can run, in default order. */
export const PALETTE_COMMANDS: readonly CommandDefinition[] = [
  {
    command: 'new-page',
    title: 'New page',
    keywords: 'open blank',
    shortcut: '⌘T',
  },
  {
    command: 'new-child-page',
    title: 'New child page',
    keywords: 'branch nested',
    shortcut: '⌥⌘T',
  },
  {
    command: 'reopen-closed',
    title: 'Reopen closed',
    keywords: 'undo restore',
    shortcut: '⇧⌘T',
  },
  {
    command: 'close-page',
    title: 'Close page',
    keywords: 'remove',
    shortcut: '⌘W',
  },
  {
    command: 'toggle-split',
    title: 'Toggle split view',
    keywords: 'compare side by side parent child beside',
    shortcut: '⌘\\',
  },
  {
    command: 'find',
    title: 'Find on page',
    keywords: 'search text',
    shortcut: '⌘F',
  },
  {
    command: 'new-workspace',
    title: 'New workspace',
    keywords: 'space create',
    shortcut: '⇧⌘N',
  },
  {
    command: 'customize-workspace',
    title: 'Customize workspace',
    keywords: 'icon colour color theme appearance rename',
    shortcut: null,
  },
  {
    command: 'toggle-sidebar',
    title: 'Toggle sidebar',
    keywords: 'hide show',
    shortcut: '⌘S',
  },
  {
    command: 'site-info',
    title: 'Site settings',
    keywords: 'permissions privacy camera microphone location',
    shortcut: null,
  },
  {
    command: 'mute-page',
    title: 'Mute or unmute page',
    keywords: 'sound audio',
    shortcut: null,
  },
  {
    command: 'zoom-reset',
    title: 'Actual size',
    keywords: 'zoom reset',
    shortcut: '⌘0',
  },
];

export interface PaletteInput {
  query: string;
  scope: 'palette' | 'address';
  pages: PageListing[];
  history: HistoryMatch[];
  activeWorkspaceId: WorkspaceId;
  activePageId: PageId | null;
  searchEngine?: SearchEngineId;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * How well `text` matches every word of the query: 0 means no match.
 * A word at the very start counts most, then at a word boundary.
 */
function matchScore(text: string, words: string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const word of words) {
    const index = haystack.indexOf(word);
    if (index === -1) return 0;
    if (index === 0) score += 3;
    else if (/[\s/.:_-]/.test(haystack[index - 1] ?? '')) score += 2;
    else score += 1;
  }
  return score;
}

/** Results for the command palette (⌘K) and the address bar's suggestions. */
export function buildPaletteItems(input: PaletteInput): PaletteItem[] {
  const query = input.query.trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const pageItems = input.pages
    .filter((page) => page.id !== input.activePageId)
    .map((page) => {
      const title = page.title || (page.url ? hostOf(page.url) : 'New page');
      const score =
        words.length === 0
          ? 1
          : matchScore(
              [title, page.url ?? '', page.note ?? '', page.workspaceName].join(
                ' ',
              ),
              words,
            );
      return { page, title, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || b.page.lastActiveAt - a.page.lastActiveAt,
    )
    .slice(0, words.length === 0 ? 8 : 6)
    .map(
      ({ page, title }): PaletteItem => ({
        kind: 'page',
        id: `page:${page.id}`,
        pageId: page.id,
        title,
        subtitle: page.url ? hostOf(page.url) : 'Empty page',
        faviconUrl: page.faviconUrl,
        workspaceName:
          page.workspaceId === input.activeWorkspaceId
            ? null
            : page.workspaceName,
      }),
    );

  const openUrls = new Set(input.pages.map((page) => page.url));
  const historyItems = input.history
    .filter((entry) => !openUrls.has(entry.url))
    .slice(0, 6)
    .map(
      (entry): PaletteItem => ({
        kind: 'history',
        id: `history:${entry.url}`,
        url: entry.url,
        title: entry.title || hostOf(entry.url),
        subtitle: hostOf(entry.url),
      }),
    );

  const commandItems =
    input.scope === 'palette'
      ? PALETTE_COMMANDS.map((definition) => ({
          definition,
          score:
            words.length === 0
              ? 1
              : matchScore(`${definition.title} ${definition.keywords}`, words),
        }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, words.length === 0 ? 4 : 5)
          .map(
            ({ definition }): PaletteItem => ({
              kind: 'command',
              id: `command:${definition.command}`,
              command: definition.command,
              title: definition.title,
              subtitle: 'Command',
              shortcut: definition.shortcut,
            }),
          )
      : [];

  if (query === '') {
    return input.scope === 'palette' ? [...pageItems, ...commandItems] : [];
  }

  const engine = input.searchEngine ?? DEFAULT_PREFERENCES.searchEngine;
  const resolved = resolveAddressInput(query, engine);
  const isSearch = resolved === searchUrl(query, engine);
  const navigate: PaletteItem = {
    kind: 'navigate',
    id: 'navigate',
    input: query,
    title: isSearch ? `Search for “${query}”` : `Go to ${hostOf(resolved)}`,
    subtitle: isSearch ? searchEngine(engine).name : resolved,
  };

  if (input.scope === 'address') {
    return [navigate, ...historyItems, ...pageItems.slice(0, 3)];
  }
  return isSearch
    ? [...pageItems, ...commandItems, ...historyItems, navigate]
    : [navigate, ...pageItems, ...commandItems, ...historyItems];
}
