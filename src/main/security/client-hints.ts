/**
 * The `Sec-CH-UA` headers Chromium sends with every secure request. Electron's
 * build never sends them, even though pages read the same values from
 * `navigator.userAgentData`. A browser that says it is Chrome and arrives
 * without them looks like a bot or a spoofed user agent, and sign-in pages
 * (Google, PayPal, banks) and bot walls refuse it. Splash adds them on
 * requests, worked out the way Chromium works them out, so headers and script
 * agree.
 */

/** What this browser is, as client hints report it. */
export interface BrowserIdentity {
  /** Chromium's full version, e.g. `156.0.8078.80`. */
  chromeVersion: string;
  /** Client-hint platform name: `macOS`, `Windows`, `Linux`. */
  platform: string;
  /** The operating system's version, e.g. `27.0.1`. */
  platformVersion: string;
  /** `arm` or `x86`. */
  architecture: string;
  bitness: string;
}

const PLATFORMS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

export function identityOf(environment: {
  chromeVersion: string;
  platform: string;
  systemVersion: string;
  arch: string;
}): BrowserIdentity {
  const { arch } = environment;
  return {
    chromeVersion: environment.chromeVersion,
    platform: PLATFORMS[environment.platform] ?? environment.platform,
    platformVersion: environment.systemVersion,
    architecture: arch.startsWith('arm') ? 'arm' : 'x86',
    bitness: arch === 'ia32' || arch === 'arm' ? '32' : '64',
  };
}

interface Brand {
  brand: string;
  version: string;
}

/**
 * Chromium's brand list: a made-up "GREASE" brand and Chromium, in an order
 * picked by the major version. Ported from `GenerateBrandVersionList` in
 * components/embedder_support/user_agent_utils.cc, for the two brands
 * Electron reports (no "Google Chrome").
 */
export function brandsOf(chromeVersion: string, full: boolean): Brand[] {
  const major = Number.parseInt(chromeVersion, 10);
  const seed = Number.isFinite(major) && major >= 0 ? major : 0;
  const chars = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
  const versions = ['8', '99', '24'];
  const greaseVersion = versions[seed % versions.length]!;
  const grease: Brand = {
    brand: `Not${chars[seed % chars.length]}A${chars[(seed + 1) % chars.length]}Brand`,
    version: full ? `${greaseVersion}.0.0.0` : greaseVersion,
  };
  const chromium: Brand = {
    brand: 'Chromium',
    version: full ? chromeVersion : String(seed),
  };
  const list = [grease, chromium];
  const order = [seed % 2, (seed + 1) % 2];
  const shuffled: Brand[] = [];
  list.forEach((brand, i) => {
    shuffled[order[i]!] = brand;
  });
  return shuffled;
}

const quoted = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

function brandHeader(brands: Brand[]): string {
  return brands
    .map(({ brand, version }) => `${quoted(brand)};v=${quoted(version)}`)
    .join(', ');
}

/** The hints a site may ask for with `Accept-CH`, by header name. */
const HIGH_ENTROPY: Record<string, (identity: BrowserIdentity) => string> = {
  'sec-ch-ua-full-version-list': (i) =>
    brandHeader(brandsOf(i.chromeVersion, true)),
  'sec-ch-ua-full-version': (i) => quoted(i.chromeVersion),
  'sec-ch-ua-platform-version': (i) => quoted(i.platformVersion),
  'sec-ch-ua-arch': (i) => quoted(i.architecture),
  'sec-ch-ua-bitness': (i) => quoted(i.bitness),
  'sec-ch-ua-model': () => quoted(''),
  'sec-ch-ua-wow64': () => '?0',
  'sec-ch-ua-form-factors': () => quoted('Desktop'),
};

/** The hints named in a response's `Accept-CH` that Splash can answer. */
export function requestedHints(acceptCh: readonly string[]): Set<string> {
  return new Set(
    acceptCh
      .flatMap((value) => value.split(','))
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name in HIGH_ENTROPY),
  );
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Chromium sends client hints only to potentially trustworthy addresses. */
function isTrustworthy(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'https:' || protocol === 'wss:') return true;
    return (
      (protocol === 'http:' || protocol === 'ws:') &&
      (LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost'))
    );
  } catch {
    return false;
  }
}

/**
 * `headers` with the client hints Chrome would add for `url`: the three it
 * always sends, plus any the site asked for. Headers already there are kept.
 */
export function withClientHints(
  headers: Record<string, string>,
  url: string,
  identity: BrowserIdentity,
  requested: ReadonlySet<string> = new Set(),
): Record<string, string> {
  if (!isTrustworthy(url)) return headers;
  const hints: Record<string, string> = {
    'sec-ch-ua': brandHeader(brandsOf(identity.chromeVersion, false)),
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': quoted(identity.platform),
  };
  for (const name of requested) {
    const value = HIGH_ENTROPY[name];
    if (value) hints[name] = value(identity);
  }
  const present = new Set(Object.keys(headers).map((n) => n.toLowerCase()));
  const added = Object.entries(hints).filter(([name]) => !present.has(name));
  return added.length === 0
    ? headers
    : { ...headers, ...Object.fromEntries(added) };
}

/**
 * The languages for `Accept-Language`, as Chrome lists them: each regional
 * language followed by its base language (`en-US, en, de-DE, de`). Electron
 * adds the q-values. Left alone, it sends only the app's own locale, while
 * pages see every system language in `navigator.languages`.
 */
export function acceptLanguages(preferred: readonly string[]): string {
  const base = (language: string) => language.split('-')[0]!.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (language: string) => {
    const key = language.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(language);
  };
  const languages = preferred.filter((language) => language.trim() !== '');
  languages.forEach((language, i) => {
    add(language);
    const next = languages[i + 1];
    if (
      base(language) !== language.toLowerCase() &&
      (next === undefined || base(next) !== base(language))
    ) {
      add(base(language));
    }
  });
  return out.join(',');
}
