import type { PageError, PageSnapshot } from '../../shared/types';

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  return parse(url)?.host ?? url;
}

/** How a URL reads in the address bar when it is not being edited. */
export function displayUrl(url: string): string {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== 'https:') return url;
  const rest = parsed.pathname + parsed.search + parsed.hash;
  return rest === '/' ? parsed.host : parsed.host + rest;
}

export function pageLabel(
  page: Pick<PageSnapshot, 'title' | 'customTitle' | 'url'>,
): string {
  if (page.customTitle) return page.customTitle;
  const title = page.title.trim();
  if (title) return title;
  if (page.url) return hostOf(page.url);
  return 'New page';
}

export type Security = 'secure' | 'insecure' | 'none';

export function securityOf(url: string | null): Security {
  const protocol = url ? parse(url)?.protocol : undefined;
  if (protocol === 'https:') return 'secure';
  if (protocol === 'http:') return 'insecure';
  return 'none';
}

const LOAD_ERRORS: Record<number, string> = {
  [-7]: 'The site took too long to respond.',
  [-101]: 'The connection was reset.',
  [-102]: 'The site refused to connect.',
  [-105]: 'The server’s address couldn’t be found.',
  [-106]: 'You’re not connected to the internet.',
  [-109]: 'The address couldn’t be reached.',
  [-118]: 'The site took too long to respond.',
  [-137]: 'The server’s address couldn’t be found.',
  [-300]: 'The address isn’t valid.',
};

export function describeError(error: PageError): {
  title: string;
  detail: string;
} {
  if (error.kind === 'crashed') {
    return {
      title: 'This page stopped working',
      detail:
        'Its process ended unexpectedly. Reloading usually brings it back.',
    };
  }
  const certificateError = error.code <= -200 && error.code > -300;
  return {
    title: 'This page couldn’t load',
    detail: certificateError
      ? 'The site’s security certificate isn’t trusted, so the connection was stopped.'
      : (LOAD_ERRORS[error.code] ?? 'Something went wrong while loading it.'),
  };
}
