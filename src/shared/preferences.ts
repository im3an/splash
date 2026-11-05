import type { AiProviderId } from './ai';

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

export const TOOLBAR_ACTIONS = [
  'bookmark',
  'share',
  'extensions',
  'split',
  'downloads',
] as const;
export type ToolbarAction = (typeof TOOLBAR_ACTIONS)[number];
export interface SavedCollection {
  id: string;
  name: string;
  kind: 'folder' | 'group';
  collapsed: boolean;
  /** Nested collections live under bookmark folders. Missing means root. */
  parentId?: string | null;
  links: {
    id: string;
    title: string;
    url: string;
    faviconUrl?: string | null;
  }[];
}

export interface Preferences {
  sidebarWidth: number;
  toolbarActions: ToolbarAction[];
  collections: SavedCollection[];
  searchEngine: SearchEngineId;
  /** Ask the search engine for suggestions while typing in the address field. */
  searchSuggestions: boolean;
  /** Dark (the default), light or following macOS; a workspace may override it. */
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  /** The site's name, quieter, after each page's title in the sidebar. */
  showSiteNames: boolean;
  /** Hairlines down each branch of the trail. */
  showBranchLines: boolean;
  /** Turn motion down in Splash even when macOS doesn't. */
  reduceMotion: boolean;
  /**
   * Where the address field and page controls sit: a top bar over the page,
   * or a pill at the top of the sidebar, like Arc.
   */
  addressBar: 'toolbar' | 'sidebar';
  /** Save into the Downloads folder, or ask where for each file. */
  downloads: 'folder' | 'ask';
  /** Pages kept awake; beyond this the least recently used ones sleep. */
  awakePages: number;
  /** On launch, show the pages as they were, or an empty page over them. */
  startup: 'restore' | 'new-page';
  /** Try HTTPS for every public site, and ask before using plain HTTP. */
  httpsOnly: boolean;
  /** Block ads and trackers, unless a site is allowed. */
  blockAds: boolean;
  /** Reject cookie banners and hide notices, never agreeing; sites can be allowed. */
  hideCookieNotices: boolean;
  /** The assistant the AI panel shows. */
  aiProvider: AiProviderId;
  aiPanelWidth: number;
  /** Zoom for sites the user hasn't zoomed, in percent. */
  defaultZoom: number;
  /** The zoom the user chose for a site, by host. */
  siteZoom: Record<string, number>;
  /** The font for pages that don't name one; empty keeps Chromium's. */
  standardFont: string;
  /** The font for code and other fixed-width text; empty keeps Chromium's. */
  monospaceFont: string;
  /** Size in pixels of text a page doesn't size itself. */
  defaultFontSize: number;
  /** No text is drawn smaller than this, in pixels; 0 turns it off. */
  minimumFontSize: number;
}

export const DEFAULT_ZOOM_CHOICES = [
  75, 80, 90, 100, 110, 125, 150, 175, 200,
] as const;
export const FONT_SIZE_CHOICES = [12, 14, 16, 18, 20, 24] as const;
export const MINIMUM_FONT_SIZE_CHOICES = [
  0, 9, 10, 11, 12, 14, 16, 18,
] as const;
/** Fonts every Mac has. */
export const STANDARD_FONTS = [
  'Arial',
  'Avenir Next',
  'Georgia',
  'Helvetica Neue',
  'New York',
  'Palatino',
  'Times New Roman',
  'Verdana',
] as const;
export const MONOSPACE_FONTS = [
  'Andale Mono',
  'Courier New',
  'Menlo',
  'Monaco',
  'SF Mono',
] as const;

export const AWAKE_PAGE_CHOICES = [6, 12, 24, 48] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  sidebarWidth: 260,
  toolbarActions: ['bookmark', 'share', 'extensions', 'split'],
  collections: [],
  searchEngine: 'duckduckgo',
  searchSuggestions: true,
  theme: 'dark',
  density: 'comfortable',
  showSiteNames: true,
  showBranchLines: true,
  reduceMotion: false,
  addressBar: 'toolbar',
  downloads: 'folder',
  awakePages: 12,
  startup: 'restore',
  httpsOnly: true,
  blockAds: true,
  hideCookieNotices: true,
  aiProvider: 'claude',
  aiPanelWidth: 420,
  defaultZoom: 100,
  siteZoom: {},
  standardFont: '',
  monospaceFont: '',
  defaultFontSize: 16,
  minimumFontSize: 0,
};
