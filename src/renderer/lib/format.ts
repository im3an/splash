import type {
  ThreatListStatus,
  ContentBlockingStatus,
  PageError,
  PageSnapshot,
  PermissionDecision,
  SitePermission,
} from '../../shared/types';

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The site a URL belongs to; a local file goes by its name. */
export function hostOf(url: string): string {
  const parsed = parse(url);
  if (parsed?.protocol === 'file:') {
    const name = parsed.pathname.split('/').at(-1) ?? '';
    try {
      return decodeURIComponent(name) || url;
    } catch {
      return name || url;
    }
  }
  return parsed?.host ?? url;
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
  if (page.url?.startsWith('view-source:'))
    return `Source · ${hostOf(page.url.slice(12))}`;
  const title = page.title.trim();
  if (title) return title;
  if (page.url) return hostOf(page.url);
  return 'New page';
}

/** "youtube.com" for https://www.youtube.com/watch?v=… */
export function shortHost(url: string): string {
  return hostOf(url).replace(/^www\./, '');
}

const TITLE_SEPARATOR = /\s+[-–—|·•]\s+/g;
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

/** The name a host's brand goes by: "wikipedia" for en.wikipedia.org. */
function brandOf(host: string): string {
  const labels = host.split('.');
  if (labels.length < 2) return labels[0] ?? host;
  const second = labels.at(-2)!;
  const generic = labels.length > 2 && SECOND_LEVEL.has(second);
  return (generic ? labels.at(-3)! : second).toLowerCase();
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Whether a piece of a title is the site's own name ("Google Search"). */
function namesSite(segment: string, brand: string): boolean {
  const name = squash(segment);
  if (!name) return false;
  return (
    name === brand ||
    (brand.length >= 3 && name.includes(brand)) ||
    (name.length >= 3 && brand.includes(name))
  );
}

/**
 * A page's title split from the site it belongs to, the way a trail row
 * shows it: "Matcha" + "Wikipedia" for "Matcha - Wikipedia". Without a site
 * name in the title the short host stands in; a title that is only the
 * site's name gets no second part.
 */
export function pageParts(page: PageSnapshot): {
  title: string;
  site: string | null;
} {
  const label = pageLabel(page);
  if (!page.url || securityOf(page.url) === 'none') {
    return { title: label, site: null };
  }
  const host = shortHost(page.url);
  const brand = brandOf(host);
  if (page.customTitle || !page.title.trim()) {
    // An untitled page's label is its host, "www." and all.
    const isHost = label.replace(/^www\./, '') === host;
    return { title: label, site: isHost ? null : host };
  }

  const title = page.title.trim();
  const separators = [...title.matchAll(TITLE_SEPARATOR)];
  const last = separators.at(-1);
  const first = separators[0];
  // Some sites name themselves at both ends ("GitHub - repo · GitHub").
  let start = 0;
  let end = title.length;
  let site: string | null = null;
  if (last && namesSite(title.slice(last.index + last[0].length), brand)) {
    site = title.slice(last.index + last[0].length);
    end = last.index;
  }
  if (
    first &&
    (first !== last || site === null) &&
    namesSite(title.slice(0, first.index), brand)
  ) {
    site ??= title.slice(0, first.index);
    start = first.index + first[0].length;
  }
  if (site) return { title: title.slice(start, end), site };
  const onlySite = separators.length === 0 && namesSite(title, brand);
  return { title, site: onlySite ? null : host };
}

/**
 * The resting address bar for a web page: its short host, then its title
 * ("youtube.com / Patient Zero"). `null` for anything that should show its
 * address as is.
 */
export function addressParts(
  page: PageSnapshot,
): { host: string; title: string | null } | null {
  if (!page.url || securityOf(page.url) === 'none') return null;
  const host = shortHost(page.url);
  const named = Boolean(page.customTitle || page.title.trim());
  return { host, title: named ? pageParts(page).title : null };
}

/**
 * A full address split around its host, so the host can carry the emphasis:
 * "https://" + "www.youtube.com" + "/watch?v=…". `null` without a host.
 */
export function urlParts(
  url: string,
): { scheme: string; host: string; rest: string } | null {
  const host = parse(url)?.host;
  const start = host ? url.indexOf(host) : -1;
  if (!host || start < 0) return null;
  return {
    scheme: url.slice(0, start),
    host,
    rest: url.slice(start + host.length),
  };
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
    case -6:
      return {
        title: `Couldn’t find ${host}`,
        detail: 'It may have been moved, renamed or deleted.',
      };
    case -107:
    case -113:
      return {
        title: `Couldn’t connect securely to ${host}`,
        detail:
          'The site and Splash couldn’t agree on a secure connection, so nothing was sent. The site may be misconfigured or out of date.',
      };
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
    case -200:
      return {
        title: 'This connection isn’t private',
        detail: `This certificate is made out to a different site than ${host}, so someone could be posing as it. Splash stopped loading it to protect what you send.`,
      };
    case -201:
      return {
        title: 'This connection isn’t private',
        detail: `${host}’s certificate has expired or isn’t valid yet, or this Mac’s clock is wrong. Splash stopped loading it to protect what you send.`,
      };
    case -202:
      return {
        title: 'This connection isn’t private',
        detail: `No authority Splash trusts vouches for ${host}’s certificate, so someone could be posing as it. That’s normal for your own server or a local one, and suspicious anywhere else.`,
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
    if (error.description === 'oom') {
      return {
        title: 'This page ran out of memory',
        detail: 'Reloading usually brings it back.',
      };
    }
    if (error.description === 'killed') {
      return {
        title: 'This page was stopped',
        detail: 'Something ended its process. Reload it when you need it.',
      };
    }
    return {
      title: 'This page crashed',
      detail:
        'Its process ended unexpectedly. Reloading usually brings it back.',
    };
  }
  if (error.certificateLocked) {
    return {
      title: 'This connection isn’t private',
      detail: `${hostOf(error.url)} only allows connections with a valid certificate, and this one isn’t, so Splash can’t let you continue. Something on your network may be interfering. Try another network, or try again later.`,
    };
  }
  if (error.kind === 'no-secure-connection') {
    return {
      title: `Couldn’t connect securely to ${hostOf(error.url)}`,
      detail:
        'Splash tried HTTPS and it didn’t work, so nothing was sent unencrypted. Over HTTP, anyone on your network could read or change what you send and see.',
    };
  }
  if (error.kind === 'dangerous-site') {
    return {
      title: `${hostOf(error.url)} was reported as dangerous`,
      detail:
        'It’s on public lists of phishing and malware sites, so Splash didn’t open it. Sites like this try to steal passwords and card details, or install harmful software.',
    };
  }
  return loadFailure(error.code, error.url ? hostOf(error.url) : 'The site');
}

const PERMISSION_NAMES: Record<SitePermission, string> = {
  camera: 'camera',
  microphone: 'microphone',
  location: 'location',
  notifications: 'notifications',
  popups: 'popups',
  midi: 'MIDI devices',
  clipboard: 'clipboard',
  sound: 'sound',
  ads: 'ads and trackers',
  apps: 'other apps',
  insecure: 'unencrypted HTTP',
  javascript: 'JavaScript',
  images: 'images',
  autoplay: 'autoplay',
  'third-party-cookies': 'third-party cookies',
  dangerous: 'a site reported as dangerous',
  certificate: 'an untrusted certificate',
  'save-passwords': 'saved passwords',
  'picture-in-picture': 'picture in picture',
};

const DECIDED_BY_SPLASH: ReadonlySet<SitePermission> = new Set<SitePermission>([
  'sound',
  'ads',
  'insecure',
  'javascript',
  'images',
  'autoplay',
  'third-party-cookies',
  'dangerous',
  'certificate',
  'save-passwords',
  'picture-in-picture',
]);

/**
 * The choices a site permission offers. Sound, ads and what a page may load
 * are decided by Splash, so no site asks about them; a popup never asks
 * either, and its middle choice lets through only what the user clicked for.
 */
export function siteDecisionOptions(
  permission: SitePermission,
): { value: PermissionDecision; label: string }[] {
  const middle =
    permission === 'popups'
      ? [{ value: 'ask' as const, label: 'On click' }]
      : DECIDED_BY_SPLASH.has(permission)
        ? []
        : [{ value: 'ask' as const, label: 'Ask' }];
  return [
    { value: 'allow', label: 'Allow' },
    ...middle,
    { value: 'block', label: 'Block' },
  ];
}

/** When a cookie ends, as the cookie viewer says it. */
export function formatCookieExpiry(expires: number | null): string {
  if (expires === null) return 'Until you quit';
  return `Until ${new Date(expires).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
}

/** "camera and microphone", "camera, microphone and location". */
export function permissionNames(
  permissions: readonly SitePermission[],
): string {
  const names = permissions.map((permission) => PERMISSION_NAMES[permission]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "12.3 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** "Updated today", or why ad blocking isn't working yet. */
export function threatListSummary(
  status: ThreatListStatus,
  now: number,
): string {
  if (status.state === 'off') return '';
  if (status.state === 'loading') return 'Downloading the lists…';
  if (status.state === 'failed' || status.updatedAt === null) {
    return 'Couldn’t download the lists, so no site is checked yet. Splash keeps trying.';
  }
  const hours = Math.floor((now - status.updatedAt) / (60 * 60 * 1000));
  const updated =
    hours <= 0
      ? 'Updated just now.'
      : hours < 24
        ? `Updated ${hours === 1 ? 'an hour' : `${hours} hours`} ago.`
        : `Updated ${Math.floor(hours / 24)} days ago.`;
  return status.updateFailed
    ? `${updated} Couldn’t download newer lists; these stay in use.`
    : updated;
}

export function filterListsSummary(
  status: ContentBlockingStatus,
  now: number,
): string {
  if (status.state === 'loading') return 'Downloading the filter lists…';
  if (status.state === 'failed' || status.updatedAt === null) {
    return 'Couldn’t download the filter lists, so nothing is blocked yet. Splash tries again every few minutes.';
  }
  const days = Math.floor((now - status.updatedAt) / DAY);
  const updated =
    days <= 0
      ? 'Updated today.'
      : days === 1
        ? 'Updated yesterday.'
        : `Updated ${days} days ago.`;
  return status.updateFailed
    ? `${updated} Couldn’t download newer lists; these stay in use.`
    : `${updated} Splash updates them every week.`;
}
