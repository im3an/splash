import {
  DEFAULT_PREFERENCES,
  searchEngine,
  type SearchEngineId,
} from '../../shared/preferences';

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

/** What a page may show: web content, its source, or a bundled extension's own page. */
export function isPageUrl(value: string): boolean {
  return (
    isNavigableUrl(value) || isSourceUrl(value) || isExtensionPageUrl(value)
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
  engine: SearchEngineId = DEFAULT_PREFERENCES.searchEngine,
): string {
  return searchEngine(engine).url + encodeURIComponent(query);
}

function looksLikeHost(hostname: string): boolean {
  if (hostname === 'localhost' || IPV4.test(hostname)) return true;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  const labels = hostname.split('.');
  const tld = labels.at(-1) ?? '';
  return labels.length >= 2 && labels.every(Boolean) && TLD.test(tld);
}

/**
 * Turns whatever the user typed into the address bar into an http(s) URL.
 * Anything that is not recognisably a web address becomes a search, so this
 * never produces a `file:`, `javascript:` or other privileged URL.
 */
export function resolveAddressInput(
  raw: string,
  engine: SearchEngineId = DEFAULT_PREFERENCES.searchEngine,
): string {
  const input = raw.trim();
  const search = () => searchUrl(input, engine);
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
