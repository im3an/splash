/** App-wide settings. Per-workspace looks live in `appearance.ts`. */

export const SEARCH_ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
  {
    id: 'brave',
    name: 'Brave Search',
    url: 'https://search.brave.com/search?q=',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    url: 'https://www.startpage.com/do/search?query=',
  },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
] as const;

export type SearchEngineId = (typeof SEARCH_ENGINES)[number]['id'];

export function searchEngine(id: SearchEngineId) {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0];
}

export interface Preferences {
  searchEngine: SearchEngineId;
  /** Light or dark for the whole app; a workspace may override it. */
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  /** Save into the Downloads folder, or ask where for each file. */
  downloads: 'folder' | 'ask';
  /** Pages kept awake; beyond this the least recently used ones sleep. */
  awakePages: number;
}

export const AWAKE_PAGE_CHOICES = [6, 12, 24, 48] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  searchEngine: 'duckduckgo',
  theme: 'system',
  density: 'comfortable',
  downloads: 'folder',
  awakePages: 12,
};
