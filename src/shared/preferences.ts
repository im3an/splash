import type { AiProviderId } from './ai';
import { DEFAULT_SEARCH_SHORTCUTS, type SearchShortcut } from './search';
import type { SecureDns } from './secure-dns';

/** App-wide settings. Per-workspace looks live in `appearance.ts`. */

export const TOOLBAR_ACTIONS = [
  'bookmark',
  'share',
  'extensions',
  'split',
  'downloads',
  'home',
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

/** What is cleared each time Splash quits. */
export interface ClearOnQuit {
  history: boolean;
  cookies: boolean;
  cache: boolean;
  downloads: boolean;
}

export interface Preferences {
  sidebarWidth: number;
  toolbarActions: ToolbarAction[];
  collections: SavedCollection[];
  /** The default engine: a built-in engine's id or a shortcut's. */
  searchEngine: string;
  /** Engines reached by typing a keyword before the search (`yt cats`). */
  searchShortcuts: SearchShortcut[];
  /** Ask the search engine for suggestions while typing in the address field. */
  searchSuggestions: boolean;
  /** Dark (the default), light or following macOS; a workspace may override it. */
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  /** The site's name, quieter, after each page's title in the sidebar. */
  showSiteNames: boolean;
  /** A row of bookmarks over the page; the sidebar holds them too. */
  bookmarksBar: boolean;
  /** PROTOTYPE: the Alma view button at the foot of the sidebar. */
  almaViewButton: boolean;
  /** Hairlines down each branch of the trail. */
  showBranchLines: boolean;
  /**
   * How the trail shows nesting: branch lines, or a quiet chevron or dot
   * beside every page and even steps of indent.
   */
  trailStyle: 'branches' | 'minimal';
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
  /** A playing video floats in its own small window when you leave its page. */
  autoPictureInPicture: boolean;
  /**
   * What a new page shows: the location field alone, a start page of bookmarks
   * and recent pages, or the homepage.
   */
  newPage: 'search' | 'start' | 'homepage';
  /** Where the Home button and ⇧⌘H go. */
  homepage: string | null;
  /** On launch, show the pages as they were, or an empty page over them. */
  startup: 'restore' | 'new-page';
  /** Try HTTPS for every public site, and ask before using plain HTTP. */
  httpsOnly: boolean;
  /** Offer to fill forms and keep logins, in Splash's own menu and bar. */
  passwordAutofill: boolean;
  /** Block ads and trackers, unless a site is allowed. */
  blockAds: boolean;
  /** Reject cookie banners and hide notices, never agreeing; sites can be allowed. */
  hideCookieNotices: boolean;
  /** Warn before a site on the public phishing and malware lists loads. */
  warnDangerousSites: boolean;
  /** Ask every site not to track or sell: Global Privacy Control and DNT. */
  privacySignal: boolean;
  /** Pages can't use or set cookies for other sites they embed or load from. */
  blockThirdPartyCookies: boolean;
  /** Who answers DNS lookups over HTTPS; "automatic" is the network's own. */
  secureDns: SecureDns;
  /** With a chosen provider, never fall back to unencrypted DNS. */
  secureDnsStrict: boolean;
  /** Cleared each time Splash quits; open pages stay in their trails. */
  clearOnQuit: ClearOnQuit;
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
  /** The language pages are spell-checked in, or macOS's pick, or none. */
  spellingLanguage: SpellingLanguage;
}

/** What the bookmark library holds, in folders and in each folder. */
export const MAX_COLLECTIONS = 2000;
export const MAX_LINKS_PER_FOLDER = 10_000;

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

/** What the macOS spell checker offers, under its own language codes. */
export const SPELLING_LANGUAGES = [
  ['ar', 'Arabic'],
  ['bg', 'Bulgarian'],
  ['cs', 'Czech'],
  ['da', 'Danish'],
  ['nl', 'Dutch'],
  ['en_AU', 'English (Australia)'],
  ['en_CA', 'English (Canada)'],
  ['en_IN', 'English (India)'],
  ['en_NZ', 'English (New Zealand)'],
  ['en_ZA', 'English (South Africa)'],
  ['en_GB', 'English (UK)'],
  ['en', 'English (US)'],
  ['fi', 'Finnish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['el', 'Greek'],
  ['he', 'Hebrew'],
  ['hi', 'Hindi'],
  ['hu', 'Hungarian'],
  ['is', 'Icelandic'],
  ['id', 'Indonesian'],
  ['ga', 'Irish'],
  ['it', 'Italian'],
  ['ko', 'Korean'],
  ['lt', 'Lithuanian'],
  ['nb', 'Norwegian Bokmål'],
  ['nn', 'Norwegian Nynorsk'],
  ['pl', 'Polish'],
  ['pt_BR', 'Portuguese (Brazil)'],
  ['pt_PT', 'Portuguese (Portugal)'],
  ['pa', 'Punjabi'],
  ['ro', 'Romanian'],
  ['ru', 'Russian'],
  ['sl', 'Slovenian'],
  ['es', 'Spanish'],
  ['sv', 'Swedish'],
  ['te', 'Telugu'],
  ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],
  ['vi', 'Vietnamese'],
] as const;
export type SpellingLanguage =
  | 'automatic'
  | 'off'
  | (typeof SPELLING_LANGUAGES)[number][0];

export const DEFAULT_PREFERENCES: Preferences = {
  sidebarWidth: 260,
  toolbarActions: ['bookmark', 'share', 'extensions', 'split'],
  collections: [],
  searchEngine: 'duckduckgo',
  searchShortcuts: [...DEFAULT_SEARCH_SHORTCUTS],
  searchSuggestions: true,
  theme: 'dark',
  density: 'comfortable',
  showSiteNames: true,
  bookmarksBar: false,
  almaViewButton: true,
  showBranchLines: true,
  trailStyle: 'minimal',
  reduceMotion: false,
  addressBar: 'toolbar',
  downloads: 'folder',
  awakePages: 12,
  autoPictureInPicture: true,
  newPage: 'start',
  homepage: null,
  startup: 'restore',
  httpsOnly: true,
  passwordAutofill: true,
  blockAds: true,
  hideCookieNotices: true,
  warnDangerousSites: true,
  privacySignal: true,
  blockThirdPartyCookies: false,
  secureDns: 'automatic',
  secureDnsStrict: false,
  clearOnQuit: {
    history: false,
    cookies: false,
    cache: false,
    downloads: false,
  },
  aiProvider: 'claude',
  aiPanelWidth: 420,
  defaultZoom: 100,
  siteZoom: {},
  standardFont: '',
  monospaceFont: '',
  defaultFontSize: 16,
  minimumFontSize: 0,
  spellingLanguage: 'automatic',
};

/** A typed homepage as a full web address; `null` if it can't be one. */
export function normalizeHomepage(text: string): string | null {
  const typed = text.trim();
  if (!typed || /\s/.test(typed)) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`,
    );
    const local = url.hostname === 'localhost';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return local || url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
