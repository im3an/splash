import type {
  PageError,
  PageSnapshot,
  SitePermission,
} from '../../shared/types';

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

export function pageLabel(page: PageSnapshot): string {
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

/** Plain-language reasons for Chromium's network errors, naming the site. */
function loadFailure(
  code: number,
  host: string,
): { title: string; detail: string } {
  switch (code) {
    case -106:
      return {
        title: 'You’re offline',
        detail: `Couldn’t reach ${host}. Check your connection, then try again.`,
      };
    case -105:
    case -137:
      return {
        title: `Couldn’t find ${host}`,
        detail:
          'Its address doesn’t exist or can’t be looked up. Check the spelling, then try again.',
      };
    case -102:
      return {
        title: `${host} refused to connect`,
        detail:
          'The site is up but turned the connection away. It may be down for maintenance.',
      };
    case -7:
    case -118:
      return {
        title: `${host} took too long`,
        detail:
          'The site didn’t answer in time. It may be busy; try again in a moment.',
      };
    case -101:
    case -100:
      return {
        title: `The connection to ${host} was cut`,
        detail: 'It was reset before the page finished loading. Try again.',
      };
    case -300:
      return {
        title: 'That address isn’t valid',
        detail: 'Check it for typos, then try again.',
      };
    default:
      if (code <= -200 && code > -300) {
        return {
          title: 'This connection isn’t private',
          detail: `${host}’s security certificate isn’t trusted, so Splash stopped loading it to protect what you send.`,
        };
      }
      return {
        title: `${host} couldn’t load`,
        detail: 'Something went wrong while loading the page. Try again.',
      };
  }
}

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
  return loadFailure(error.code, error.url ? hostOf(error.url) : 'The site');
}

const PERMISSION_NAMES: Record<SitePermission, string> = {
  camera: 'camera',
  microphone: 'microphone',
  location: 'location',
  notifications: 'notifications',
  midi: 'MIDI devices',
  clipboard: 'clipboard',
  sound: 'sound',
};

/** "camera and microphone", "camera, microphone and location". */
export function permissionNames(
  permissions: readonly SitePermission[],
): string {
  const names = permissions.map((permission) => PERMISSION_NAMES[permission]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
