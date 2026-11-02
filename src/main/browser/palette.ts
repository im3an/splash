import type {
  PageId,
  PaletteCommand,
  PaletteItem,
  PaletteSection,
  WorkspaceId,
  WorkspaceSummary,
} from '../../shared/types';
import { COMMAND_PREFIX, type PaletteScope } from '../../shared/palette';
import type { HistoryMatch } from '../storage/trail-store';
import type { PageListing } from './browser-controller';
import {
  bareUrl,
  inlineCompletion,
  suggestedHistory,
  type InlineCompletion,
} from './history-ranking';
import { resolveAddressInput, searchUrl } from './url';
import {
  DEFAULT_PREFERENCES,
  searchEngine,
  type SearchEngineId,
} from '../../shared/preferences';

/** What the palette needs to know about the page on screen. */
export interface ActivePageFacts {
  id: PageId;
  url: string | null;
  pinned: boolean;
  muted: boolean;
  hasChildren: boolean;
  hasNote: boolean;
  /** Other pages share its workspace. */
  hasOthers?: boolean;
  /** It's one side of the split view on screen. */
  inSplit?: boolean;
}

interface CommandDefinition {
  command: PaletteCommand;
  /** Commands that toggle say what they will do now: "Unpin page". */
  title: string | ((page: ActivePageFacts) => string);
  keywords: string;
  shortcut: string | null;
  /** Hidden unless its subject exists: a page, an address, children … */
  needs?:
    | 'page'
    | 'address'
    | 'children'
    | 'others'
    | 'split'
    | 'workspaces'
    | 'closed';
  /** Offered before anything is typed. */
  suggested?: boolean;
}

/** Browser actions the palette can run, in default order. */
export const PALETTE_COMMANDS: readonly CommandDefinition[] = [
  {
    command: 'new-page',
    title: 'New page',
    keywords: 'open blank',
    shortcut: '⌘T',
    suggested: true,
  },
  {
    command: 'pin-page',
    title: (page) => (page.pinned ? 'Unpin page' : 'Pin page'),
    keywords: 'bookmark save keep favourite favorite',
    shortcut: '⌘D',
    needs: 'page',
    suggested: true,
  },
  {
    command: 'reopen-closed',
    title: 'Reopen closed',
    keywords: 'undo restore',
    shortcut: '⇧⌘T',
    needs: 'closed',
    suggested: true,
  },
  {
    command: 'new-workspace',
    title: 'New workspace',
    keywords: 'space create',
    shortcut: '⇧⌘N',
    suggested: true,
  },
  {
    command: 'new-child-page',
    title: 'New child page',
    keywords: 'branch nested',
    shortcut: '⌥⌘T',
  },
  {
    command: 'close-page',
    title: 'Close page',
    keywords: 'remove',
    shortcut: '⌘W',
    needs: 'page',
  },
  {
    command: 'close-branch',
    title: 'Close branch',
    keywords: 'remove children below',
    shortcut: '⌥⌘W',
    needs: 'children',
  },
  {
    command: 'close-others',
    title: 'Close other pages',
    keywords: 'remove rest tidy clean up',
    shortcut: null,
    needs: 'others',
  },
  {
    command: 'go-back',
    title: 'Back',
    keywords: 'previous history return',
    shortcut: '⌘[',
    needs: 'address',
  },
  {
    command: 'go-forward',
    title: 'Forward',
    keywords: 'next history',
    shortcut: '⌘]',
    needs: 'address',
  },
  {
    command: 'close-split',
    title: 'Close split view',
    keywords: 'side by side single',
    shortcut: null,
    needs: 'split',
  },
  {
    command: 'toggle-split',
    title: 'Toggle split view',
    keywords: 'compare side by side parent child beside',
    shortcut: '⌘\\',
    needs: 'page',
  },
  {
    command: 'find',
    title: 'Find on page',
    keywords: 'search text',
    shortcut: '⌘F',
    needs: 'address',
  },
  {
    command: 'reload',
    title: 'Reload page',
    keywords: 'refresh',
    shortcut: '⌘R',
    needs: 'address',
  },
  {
    command: 'duplicate-page',
    title: 'Duplicate page',
    keywords: 'copy clone',
    shortcut: null,
    needs: 'address',
  },
  {
    command: 'copy-link',
    title: 'Copy link',
    keywords: 'url address share clipboard',
    shortcut: null,
    needs: 'address',
  },
  {
    command: 'rename-page',
    title: 'Rename page',
    keywords: 'title name',
    shortcut: null,
    needs: 'page',
  },
  {
    command: 'edit-note',
    title: (page) => (page.hasNote ? 'Edit note' : 'Add note'),
    keywords: 'annotate comment memo',
    shortcut: null,
    needs: 'page',
  },
  {
    command: 'print',
    title: 'Print page',
    keywords: 'paper pdf',
    shortcut: '⌘P',
    needs: 'address',
  },
  {
    command: 'save-page',
    title: 'Save page as',
    keywords: 'download html archive file',
    shortcut: '⇧⌘S',
    needs: 'address',
  },
  {
    command: 'mute-page',
    title: (page) => (page.muted ? 'Unmute page' : 'Mute page'),
    keywords: 'sound audio',
    shortcut: '⌃⌘M',
    needs: 'address',
  },
  {
    command: 'site-info',
    title: 'Site settings',
    keywords: 'permissions privacy camera microphone location',
    shortcut: null,
    needs: 'address',
  },
  {
    command: 'zoom-in',
    title: 'Zoom in',
    keywords: 'bigger larger',
    shortcut: '⌘+',
    needs: 'address',
  },
  {
    command: 'zoom-out',
    title: 'Zoom out',
    keywords: 'smaller',
    shortcut: '⌘−',
    needs: 'address',
  },
  {
    command: 'zoom-reset',
    title: 'Actual size',
    keywords: 'zoom reset',
    shortcut: '⌘0',
    needs: 'address',
  },
  {
    command: 'show-downloads',
    title: 'Show downloads',
    keywords: 'files saved',
    shortcut: '⌥⌘L',
  },
  {
    command: 'show-history',
    title: 'Show history',
    keywords: 'visited past browsing sites',
    shortcut: '⌘Y',
  },
  {
    command: 'customize-workspace',
    title: 'Customize workspace',
    keywords: 'icon colour color theme appearance rename',
    shortcut: null,
  },
  {
    command: 'rename-workspace',
    title: 'Rename workspace',
    keywords: 'space name title',
    shortcut: null,
  },
  {
    command: 'delete-workspace',
    title: 'Delete workspace',
    keywords: 'space remove close',
    shortcut: null,
    needs: 'workspaces',
  },
  {
    command: 'toggle-sidebar',
    title: 'Toggle sidebar',
    keywords: 'hide show',
    shortcut: '⌘S',
  },
  {
    command: 'open-settings',
    title: 'Settings',
    keywords: 'preferences options',
    shortcut: '⌘,',
  },
];

export interface PaletteInput {
  query: string;
  scope: PaletteScope;
  pages: PageListing[];
  history: HistoryMatch[];
  workspaces?: readonly WorkspaceSummary[];
  activeWorkspaceId: WorkspaceId;
  activePageId: PageId | null;
  /** Decides which commands apply and what the toggles say. */
  activePage?: ActivePageFacts | null;
  /** Something closed can come back; without it Reopen closed is hidden. */
  canReopen?: boolean;
  searchEngine?: SearchEngineId;
  /**
   * Lead with the address the typed text completes to, from history (the
   * address field and the location palette, while typing forward).
   */
  complete?: boolean;
  now?: number;
}

/** How many rows each section shows, before and after typing. */
const LIMITS: Record<
  Exclude<PaletteSection, 'go' | 'search'>,
  [number, number]
> = {
  pinned: [6, 4],
  pages: [5, 6],
  workspaces: [4, 4],
  commands: [4, 5],
  history: [0, 6],
};

/** Sections in the order they appear when their best matches tie. */
const SECTION_ORDER: readonly PaletteSection[] = [
  'pinned',
  'pages',
  'workspaces',
  'commands',
  'history',
];

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The site an address belongs to, the same with or without "www.". */
function siteOf(url: string): string {
  return hostOf(url).replace(/^www\./, '');
}

type SiteIcons = ReadonlyMap<string, string>;

/** The icon each site showed last: in an open page, else in history. */
function siteIcons(
  pages: readonly PageListing[],
  history: readonly HistoryMatch[],
): SiteIcons {
  const icons = new Map<string, string>();
  for (const entry of history.toSorted(
    (a, b) => a.lastVisitedAt - b.lastVisitedAt,
  )) {
    if (entry.faviconUrl) icons.set(siteOf(entry.url), entry.faviconUrl);
  }
  for (const page of pages) {
    if (page.url && page.faviconUrl) {
      icons.set(siteOf(page.url), page.faviconUrl);
    }
  }
  return icons;
}

/**
 * How well one word matches a field, at its best place: the start, a word
 * boundary, or inside a word (which `wordStartOnly` fields ignore).
 */
function wordScore(text: string, word: string, wordStartOnly: boolean): number {
  let best = 0;
  for (
    let at = text.indexOf(word);
    at !== -1;
    at = text.indexOf(word, at + 1)
  ) {
    const score =
      at === 0
        ? 3
        : /[\s/.:_-]/.test(text[at - 1] ?? '')
          ? 2
          : wordStartOnly
            ? 0
            : 1;
    best = Math.max(best, score);
    if (best === 3) break;
  }
  return best;
}

/**
 * How well the fields match every word of the query: 0 means some word
 * matches nowhere. Each field has a weight, so a title match beats the
 * same match in an address or a note, and may count only word starts, so
 * a keyword list doesn't match on letters inside its words.
 */
export function matchScore(
  fields: readonly (readonly [string, number, boolean?])[],
  words: readonly string[],
): number {
  const haystacks = fields.map(
    ([text, weight, wordStartOnly = false]) =>
      [text.toLowerCase(), weight, wordStartOnly] as const,
  );
  let score = 0;
  for (const word of words) {
    let best = 0;
    for (const [text, weight, wordStartOnly] of haystacks) {
      best = Math.max(best, wordScore(text, word, wordStartOnly) * weight);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

/** "3 days ago", for history rows. */
export function visitedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  return 'Over a year ago';
}

function applies(
  definition: CommandDefinition,
  page: ActivePageFacts | null,
  input: PaletteInput,
): page is ActivePageFacts {
  switch (definition.needs) {
    case undefined:
      return true;
    case 'closed':
      return input.canReopen ?? true;
    case 'workspaces':
      return (input.workspaces?.length ?? 1) > 1;
    case 'others':
      return page?.hasOthers === true;
    case 'split':
      return page?.inSplit === true;
    case 'page':
      return page !== null;
    case 'address':
      return page?.url != null;
    case 'children':
      return page?.hasChildren === true;
  }
}

interface Scored {
  item: PaletteItem;
  score: number;
}

/** The best-scoring entries, best first; ties keep their given order. */
function top(entries: Scored[], limit: number): Scored[] {
  return entries
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Results for the command palette (⌘K, or the location field on a blank
 * page) and the address bar's suggestions.
 * The palette's come in sections; the section with the best match leads.
 */
export function buildPaletteItems(input: PaletteInput): PaletteItem[] {
  const raw = input.query.trim();
  const commandsOnly =
    input.scope !== 'address' && raw.startsWith(COMMAND_PREFIX);
  const query = commandsOnly ? raw.slice(COMMAND_PREFIX.length).trim() : raw;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const typed = words.length > 0;
  const limit = (section: Exclude<PaletteSection, 'go' | 'search'>) =>
    LIMITS[section][typed ? 1 : 0];
  const activePage = input.activePage ?? null;
  const now = input.now ?? Date.now();
  const icons = typed ? siteIcons(input.pages, input.history) : new Map();

  const pageEntries = (pinned: boolean): Scored[] =>
    input.pages
      .filter(
        (page) => page.id !== input.activePageId && page.pinned === pinned,
      )
      // Most recent first, so ties go to the page used last.
      .toSorted((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((page) => {
        const title = page.title || (page.url ? hostOf(page.url) : 'New page');
        const score = typed
          ? matchScore(
              [
                [title, 2],
                [page.url ?? '', 1],
                [page.note ?? '', 1],
                [page.workspaceName, 1],
              ],
              words,
            )
          : 1;
        const item: PaletteItem = {
          kind: 'page',
          section: pinned && input.scope !== 'address' ? 'pinned' : 'pages',
          id: `page:${page.id}`,
          pageId: page.id,
          title,
          subtitle: page.url ? hostOf(page.url) : 'Empty page',
          faviconUrl: page.faviconUrl,
          workspaceName:
            page.workspaceId === input.activeWorkspaceId
              ? null
              : page.workspaceName,
        };
        return { item, score };
      });

  const completion =
    typed && input.complete && input.scope !== 'palette'
      ? inlineCompletion(input.query, input.history, now)
      : null;
  // Open pages, and the address a completion leads to, aren't repeated as
  // history.
  const hidden = [...input.pages.map((page) => page.url), completion?.url];
  const history = typed
    ? suggestedHistory(query, input.history, now, hidden)
    : [];

  if (input.scope === 'address') {
    if (!typed) return [];
    const pages = top([...pageEntries(true), ...pageEntries(false)], 3).map(
      (entry) => entry.item,
    );
    return [
      ...leadItems(query, completion, icons, input.searchEngine),
      ...history.slice(0, 6).map(({ entry }) => historyItem(entry, now, icons)),
      ...pages,
    ];
  }

  const commandEntries: Scored[] = PALETTE_COMMANDS.filter(
    (definition) =>
      applies(definition, activePage, input) &&
      (typed || commandsOnly || definition.suggested),
  ).map((definition) => {
    const title =
      typeof definition.title === 'function'
        ? definition.title(activePage!)
        : definition.title;
    const score = typed
      ? matchScore(
          [
            [title, 2],
            [definition.keywords, 1, true],
          ],
          words,
        )
      : 1;
    const item: PaletteItem = {
      kind: 'command',
      section: 'commands',
      id: `command:${definition.command}`,
      command: definition.command,
      title,
      subtitle: 'Command',
      shortcut: definition.shortcut,
    };
    return { item, score };
  });

  if (commandsOnly) {
    return top(commandEntries, PALETTE_COMMANDS.length).map((e) => e.item);
  }

  const workspaceEntries: Scored[] = (input.workspaces ?? [])
    .map((workspace, index) => ({ workspace, index }))
    .filter(({ workspace }) => workspace.id !== input.activeWorkspaceId)
    .map(({ workspace, index }) => {
      const pages = `${workspace.pageCount} ${workspace.pageCount === 1 ? 'page' : 'pages'}`;
      const item: PaletteItem = {
        kind: 'workspace',
        section: 'workspaces',
        id: `workspace:${workspace.id}`,
        workspaceId: workspace.id,
        title: workspace.name,
        subtitle: pages,
        appearance: workspace.appearance,
        shortcut: index < 9 ? `⌃${index + 1}` : null,
      };
      const score = typed ? matchScore([[workspace.name, 2]], words) : 1;
      return { item, score };
    });

  // Ranked already; history always comes last, so its score doesn't count.
  const historyEntries: Scored[] = history.map(({ entry }) => ({
    item: historyItem(entry, now, icons),
    score: 1,
  }));

  const sections = new Map<PaletteSection, Scored[]>([
    ['pinned', top(pageEntries(true), limit('pinned'))],
    ['pages', top(pageEntries(false), limit('pages'))],
    ['workspaces', top(workspaceEntries, limit('workspaces'))],
    ['commands', top(commandEntries, limit('commands'))],
    ['history', historyEntries.slice(0, limit('history'))],
  ]);
  const best = (section: PaletteSection) =>
    section === 'history' ? 0 : (sections.get(section)?.[0]?.score ?? 0);
  // The section with the strongest match leads; history, which matches
  // loosely, always comes last.
  const ordered = typed
    ? SECTION_ORDER.toSorted((a, b) => best(b) - best(a))
    : SECTION_ORDER;
  const results = ordered.flatMap((section) =>
    (sections.get(section) ?? []).map((entry) => entry.item),
  );

  if (!typed) return results;
  if (input.scope !== 'palette') {
    return [
      ...leadItems(query, completion, icons, input.searchEngine),
      ...results,
    ];
  }
  // In the palette a search is the fallback.
  const navigate = navigateItem(query, icons, input.searchEngine);
  const isSearch = navigate.title.startsWith('Search');
  return isSearch ? [...results, navigate] : [navigate, ...results];
}

/**
 * What Enter does in the address field: go to the completed address when
 * there is one, then go to or search for exactly what was typed.
 */
function leadItems(
  query: string,
  completion: InlineCompletion | null,
  icons: SiteIcons,
  engine?: SearchEngineId,
): PaletteItem[] {
  const navigate = navigateItem(query, icons, engine);
  if (!completion) return [navigate];
  const lead: PaletteItem = {
    kind: 'navigate',
    section: 'go',
    id: 'complete',
    input: completion.url,
    completion: completion.text,
    title: completion.title,
    subtitle: bareUrl(completion.url),
    faviconUrl: icons.get(siteOf(completion.url)) ?? null,
  };
  const same =
    resolveAddressInput(query, engine ?? DEFAULT_PREFERENCES.searchEngine) ===
    completion.url;
  return same ? [lead] : [lead, navigate];
}

/** The engine's suggestions as rows, without the query itself. */
export function searchSuggestionItems(
  suggestions: readonly string[],
  query: string,
  engine: SearchEngineId = DEFAULT_PREFERENCES.searchEngine,
  limit = 4,
): PaletteItem[] {
  const typed = query.trim().toLowerCase();
  return suggestions
    .filter((text) => text.toLowerCase() !== typed)
    .slice(0, limit)
    .map((text) => ({
      kind: 'search',
      section: 'search',
      id: `search:${text}`,
      url: searchUrl(text, engine),
      title: text,
      // The "Search for" row already names the engine.
      subtitle: '',
    }));
}

function historyItem(
  entry: HistoryMatch,
  now: number,
  icons: SiteIcons,
): PaletteItem {
  return {
    kind: 'history',
    section: 'history',
    id: `history:${entry.url}`,
    url: entry.url,
    faviconUrl: entry.faviconUrl ?? icons.get(siteOf(entry.url)) ?? null,
    title: entry.title || hostOf(entry.url),
    subtitle: `${hostOf(entry.url)} · ${visitedAgo(entry.lastVisitedAt, now)}`,
  };
}

/** "Go to example.org", or "Search for …" when the input isn't an address. */
function navigateItem(
  query: string,
  icons: SiteIcons,
  engine?: SearchEngineId,
): PaletteItem {
  const id = engine ?? DEFAULT_PREFERENCES.searchEngine;
  const resolved = resolveAddressInput(query, id);
  const isSearch = resolved === searchUrl(query, id);
  return {
    kind: 'navigate',
    section: 'go',
    id: 'navigate',
    input: query,
    title: isSearch ? `Search for “${query}”` : `Go to ${hostOf(resolved)}`,
    subtitle: isSearch ? searchEngine(id).name : resolved,
    faviconUrl: isSearch ? null : (icons.get(siteOf(resolved)) ?? null),
  };
}
