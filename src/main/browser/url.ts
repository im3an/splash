const NAVIGABLE_PROTOCOLS = new Set(['http:', 'https:']);
const SEARCH_URL = 'https://duckduckgo.com/?q=';

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

export function searchUrl(query: string): string {
  return SEARCH_URL + encodeURIComponent(query);
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
export function resolveAddressInput(raw: string): string {
  const input = raw.trim();
  if (input === '' || /\s/.test(input)) return searchUrl(input);

  if (SCHEME.test(input)) {
    return isNavigableUrl(input) ? new URL(input).href : searchUrl(input);
  }

  let candidate: URL;
  try {
    candidate = new URL(`http://${input}`);
  } catch {
    return searchUrl(input);
  }
  if (!looksLikeHost(candidate.hostname)) return searchUrl(input);

  const isLocal =
    candidate.hostname === 'localhost' ||
    IPV4.test(candidate.hostname) ||
    candidate.hostname.startsWith('[');
  if (!isLocal) candidate.protocol = 'https:';
  return candidate.href;
}
