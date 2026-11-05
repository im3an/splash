/**
 * Where typed searches go: one default engine, plus shortcuts reached by
 * typing a keyword first (`yt cats`). A shortcut can also be the default.
 */

/** Where the search words go in an engine's address. */
export const SEARCH_PLACEHOLDER = '%s';

export const SEARCH_ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  {
    id: 'brave',
    name: 'Brave Search',
    url: 'https://search.brave.com/search?q=%s',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    url: 'https://www.startpage.com/do/search?query=%s',
  },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
] as const;

export type SearchEngineId = (typeof SEARCH_ENGINES)[number]['id'];

export interface SearchShortcut {
  id: string;
  name: string;
  /** Typed before the search words. Stored in lower case. */
  keyword: string;
  /** An http(s) address with `%s` where the search words go. */
  url: string;
}

/** The part of the preferences that decides where a search goes. */
export interface SearchSettings {
  /** A built-in engine's id or a shortcut's. */
  searchEngine: string;
  searchShortcuts: readonly SearchShortcut[];
}

export const DEFAULT_SEARCH_SHORTCUTS: readonly SearchShortcut[] = [
  {
    id: 'google',
    name: 'Google',
    keyword: 'g',
    url: 'https://www.google.com/search?q=%s',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    keyword: 'ddg',
    url: 'https://duckduckgo.com/?q=%s',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    keyword: 'yt',
    url: 'https://www.youtube.com/results?search_query=%s',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keyword: 'w',
    url: 'https://en.wikipedia.org/w/index.php?search=%s',
  },
  {
    id: 'github',
    name: 'GitHub',
    keyword: 'gh',
    url: 'https://github.com/search?q=%s',
  },
];

/** A built-in engine, the only kind Splash asks for suggestions. */
export function builtInEngine(id: string) {
  return SEARCH_ENGINES.find((engine) => engine.id === id);
}

/** The default engine, falling back when its shortcut has been removed. */
export function defaultEngine(search: SearchSettings): {
  name: string;
  url: string;
} {
  return (
    builtInEngine(search.searchEngine) ??
    search.searchShortcuts.find((item) => item.id === search.searchEngine) ??
    SEARCH_ENGINES[0]
  );
}

/** Shortcuts that add an engine the default list doesn't already have. */
export function customEngines(search: SearchSettings): SearchShortcut[] {
  return search.searchShortcuts.filter(
    (item) => !SEARCH_ENGINES.some((engine) => engine.url === item.url),
  );
}

export function fillSearchUrl(template: string, query: string): string {
  return template.split(SEARCH_PLACEHOLDER).join(encodeURIComponent(query));
}

/** The shortcut a typed line asks for: a keyword, a space, then the words. */
export function keywordSearch(
  input: string,
  shortcuts: readonly SearchShortcut[],
): { shortcut: SearchShortcut; query: string } | null {
  const match = /^[!/]?(\S+)\s+(\S[\s\S]*)$/.exec(input.trim());
  if (!match) return null;
  const keyword = match[1]!.toLowerCase();
  const shortcut = shortcuts.find((item) => item.keyword === keyword);
  return shortcut ? { shortcut, query: match[2]! } : null;
}

/** The shortcut a line is exactly the keyword of, with no words yet. */
export function keywordOnly(
  input: string,
  shortcuts: readonly SearchShortcut[],
): SearchShortcut | null {
  const keyword = input.trim().toLowerCase();
  return shortcuts.find((item) => item.keyword === keyword) ?? null;
}

/** `!yt` or `/yt`: the keyword marked as a command, with no words yet. */
export function commandOnly(
  input: string,
  shortcuts: readonly SearchShortcut[],
): SearchShortcut | null {
  const match = /^[!/](\S+)$/.exec(input.trim());
  return match ? keywordOnly(match[1]!, shortcuts) : null;
}

/**
 * Whether what's been typed starts a shortcut's search: its keyword (with or
 * without `!` or `/`) and a space. `rest` is what comes after, the field's
 * text once the shortcut has taken over the start of it.
 */
export function scopeEntry(
  text: string,
  shortcuts: readonly SearchShortcut[],
): { shortcut: SearchShortcut; rest: string } | null {
  const match = /^[!/]?(\S+)\s+([\s\S]*)$/.exec(text);
  if (!match) return null;
  const shortcut = keywordOnly(match[1]!, shortcuts);
  return shortcut ? { shortcut, rest: match[2]! } : null;
}

/** The line a scoped field stands for, for everything that resolves input. */
export function scopedInput(shortcut: SearchShortcut, text: string): string {
  return `!${shortcut.keyword} ${text}`.trimEnd();
}

/** Where a shortcut's site lives: the page `!yt` alone goes to. */
export function shortcutOrigin(shortcut: SearchShortcut): string {
  return new URL(fillSearchUrl(shortcut.url, '')).origin;
}

/** Keywords can't start with `!`, which marks one as a command. */
const KEYWORD = /^[\p{L}\p{N}_@-]{1,32}$/u;

export function isSearchKeyword(value: string): boolean {
  return KEYWORD.test(value);
}

/** An http(s) address with the placeholder, and nowhere else it could run. */
export function isSearchTemplate(value: string): boolean {
  if (!value.includes(SEARCH_PLACEHOLDER)) return false;
  try {
    const { protocol } = new URL(fillSearchUrl(value, 'x'));
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** What a person typed into the shortcut form, tidied for saving. */
export function normalizeShortcut(draft: {
  name: string;
  keyword: string;
  url: string;
}): { name: string; keyword: string; url: string } {
  const url = draft.url.trim();
  return {
    name: draft.name.trim(),
    keyword: draft.keyword.trim().toLowerCase(),
    url: /^[a-z][a-z\d+.-]*:/i.test(url) || !url ? url : `https://${url}`,
  };
}

/** Why a shortcut can't be saved, in words for the form; `null` if it can. */
export function shortcutProblem(
  draft: { name: string; keyword: string; url: string },
  others: readonly SearchShortcut[],
): string | null {
  const { name, keyword, url } = normalizeShortcut(draft);
  if (!name) return 'Give it a name.';
  if (!keyword) return 'Choose a keyword to type before your search.';
  if (!isSearchKeyword(keyword))
    return 'A keyword is one word: letters, numbers, - or _.';
  const taken = others.find((item) => item.keyword === keyword);
  if (taken) return `“${keyword}” already searches ${taken.name}.`;
  if (!url) return 'Enter the address to search.';
  if (!url.includes(SEARCH_PLACEHOLDER))
    return 'Put %s where the search words go, like example.com/search?q=%s';
  if (!isSearchTemplate(url))
    return 'That isn’t a web address. It should start with https://';
  return null;
}
