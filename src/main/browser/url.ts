import { extname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import {
  commandOnly,
  defaultEngine,
  fillSearchUrl,
  keywordSearch,
  shortcutOrigin,
  type SearchSettings,
} from '../../shared/search';

const NAVIGABLE_PROTOCOLS = new Set(['http:', 'https:']);

const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const TLD = /^([a-z]{2,63}|xn--[a-z\d-]{1,59})$/i;

/** Pages may only ever be pointed at plain web content. */
export function isNavigableUrl(value: string): boolean {
  try {
    return NAVIGABLE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Schemes a link may never hand to another app: they're the browser's own,
 * reach local files, or run code.
 */
const NEVER_EXTERNAL = new Set([
  'http:',
  'https:',
  'file:',
  'javascript:',
  'data:',
  'blob:',
  'about:',
  'filesystem:',
  'view-source:',
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'devtools:',
  'app:',
]);

const MAX_EXTERNAL_URL = 4096;

/** A link meant for another app on the Mac, such as mailto: or zoommtg:. */
export function isExternalAppUrl(value: string): boolean {
  if (value.length > MAX_EXTERNAL_URL) return false;
  try {
    const { protocol } = new URL(value);
    return (
      /^[a-z][a-z0-9+.-]*:$/.test(protocol) && !NEVER_EXTERNAL.has(protocol)
    );
  } catch {
    return false;
  }
}

/** Extensions Splash ships with, whose own pages may open as pages. */
const extensionIds = new Set<string>();

export function allowExtensionPages(id: string): void {
  extensionIds.add(id);
}

/** A settings or dashboard page of a bundled extension. */
export function isExtensionPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'chrome-extension:' && extensionIds.has(url.host);
  } catch {
    return false;
  }
}

/** Source inspection is limited to ordinary web pages, never local or privileged URLs. */
export function isSourceUrl(value: string): boolean {
  return (
    value.startsWith('view-source:') &&
    isNavigableUrl(value.slice('view-source:'.length))
  );
}

/** Where the file lives on this Mac, or null for anything else. */
function localFilePath(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'file:' && url.host === '' ? url.pathname : null;
  } catch {
    return null;
  }
}

export function isLocalFileUrl(value: string): boolean {
  return localFilePath(value) !== null;
}

/**
 * Files the user chose themselves. Nothing else on disk is reachable, and
 * only by path: a page's own #part or ?query doesn't make it another file.
 */
const openedFiles = new Set<string>();
let openedFilesChanged: ((urls: string[]) => void) | null = null;

function announceOpenedFiles(): void {
  openedFilesChanged?.([...openedFiles].map((path) => `file://${path}`));
}

export function allowLocalFile(value: string): void {
  const path = localFilePath(value);
  if (path === null || openedFiles.has(path)) return;
  openedFiles.add(path);
  announceOpenedFiles();
}

/** Forgets every opened file but those in `keep`. */
export function forgetLocalFiles(keep: readonly string[]): void {
  const kept = new Set(keep.map(localFilePath));
  for (const path of openedFiles) {
    if (!kept.has(path)) openedFiles.delete(path);
  }
  announceOpenedFiles();
}

/** Tells `listener` the whole list whenever it changes, so it can be saved. */
export function watchOpenedFiles(listener: (urls: string[]) => void): void {
  openedFilesChanged = listener;
}

function isOpenedFile(value: string): boolean {
  const path = localFilePath(value);
  return path !== null && openedFiles.has(path);
}

/**
 * Whether an opened file may lead to `target`: only files in its own folder
 * or below, as a saved set of documents does. Encoded slashes are refused so
 * a path can't climb out after Chromium decodes it.
 */
export function mayFollowFileLink(current: string, target: string): boolean {
  const path = localFilePath(target);
  if (path === null || !isOpenedFile(current)) return false;
  if (/%2f|%5c/i.test(path)) return false;
  const from = localFilePath(current)!;
  return path.startsWith(from.slice(0, from.lastIndexOf('/') + 1));
}

/** What a page can show itself. Anything else would only start a download. */
const OPENABLE_EXTENSIONS = [
  'html',
  'htm',
  'xhtml',
  'mhtml',
  'mht',
  'pdf',
  'txt',
  'json',
  'xml',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'flac',
];

export const OPENABLE_FILE_FILTER = {
  name: 'Web pages, PDFs, images, text, audio and video',
  extensions: OPENABLE_EXTENSIONS,
};

/** The address of a file a page can show, or null for any other path. */
export function localFileUrl(file: string): string | null {
  if (!isAbsolute(file)) return null;
  const extension = extname(file).slice(1).toLowerCase();
  return OPENABLE_EXTENSIONS.includes(extension)
    ? pathToFileURL(file).href
    : null;
}

/**
 * What a page may show: web content, its source, a bundled extension's own
 * page, or a file the user opened.
 */
export function isPageUrl(value: string): boolean {
  return (
    isNavigableUrl(value) ||
    isSourceUrl(value) ||
    isExtensionPageUrl(value) ||
    isOpenedFile(value)
  );
}

/**
 * What a web page may open as a new page (window.open, target=_blank): web
 * pages and their source. Never a bundled extension's own pages, which
 * would skip Chromium's web-accessible-resources check.
 */
export function mayOpenFromPage(value: string): boolean {
  return isNavigableUrl(value) || isSourceUrl(value);
}

export function searchUrl(
  query: string,
  search: SearchSettings = DEFAULT_PREFERENCES,
): string {
  return fillSearchUrl(defaultEngine(search).url, query);
}

/**
 * What to go to for text from the clipboard: an address wrapped over several
 * lines joins back up; anything else with line breaks is one search.
 */
export function clipboardAddressInput(text: string): string {
  const trimmed = text.trim().slice(0, 8192);
  if (!/\n/.test(trimmed)) return trimmed;
  const joined = trimmed.replace(/\s*\n\s*/g, '');
  return /\s/.test(joined) ? trimmed.replace(/\s+/g, ' ') : joined;
}

function looksLikeHost(hostname: string): boolean {
  if (hostname === 'localhost' || IPV4.test(hostname)) return true;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  const labels = hostname.split('.');
  const tld = labels.at(-1) ?? '';
  return labels.length >= 2 && labels.every(Boolean) && TLD.test(tld);
}

/**
 * Turns whatever the user typed into the address bar into an http(s) URL. A
 * keyword first (`yt cats`) searches with that shortcut. Anything else that is
 * not recognisably a web address becomes a search, so this never produces a
 * `file:`, `javascript:` or other privileged URL.
 */
export function resolveAddressInput(
  raw: string,
  settings: SearchSettings = DEFAULT_PREFERENCES,
): string {
  const input = raw.trim();
  const keyed = keywordSearch(input, settings.searchShortcuts);
  if (keyed) return fillSearchUrl(keyed.shortcut.url, keyed.query);
  const command = commandOnly(input, settings.searchShortcuts);
  if (command) return shortcutOrigin(command);
  const search = () => searchUrl(input, settings);
  if (input === '' || /\s/.test(input)) return search();
  if (isSourceUrl(input)) return input;

  if (SCHEME.test(input)) {
    return isNavigableUrl(input) ? new URL(input).href : search();
  }

  let candidate: URL;
  try {
    candidate = new URL(`http://${input}`);
  } catch {
    return search();
  }
  if (!looksLikeHost(candidate.hostname)) return search();

  const isLocal =
    candidate.hostname === 'localhost' ||
    IPV4.test(candidate.hostname) ||
    candidate.hostname.startsWith('[');
  if (!isLocal) candidate.protocol = 'https:';
  return candidate.href;
}
