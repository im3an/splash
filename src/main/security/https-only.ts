const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Names only a local network resolves, which can't get a public certificate. */
const LOCAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.lan',
  '.home',
  '.internal',
  '.intranet',
  '.corp',
  '.home.arpa',
  '.test',
];

/**
 * Whether HTTPS can't be expected of a host: this Mac, its network, or a bare
 * IP address, which public certificates don't cover in practice.
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    !host.includes('.') ||
    host.startsWith('[') ||
    IPV4.test(host) ||
    LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** The HTTPS form of a plain-HTTP address on the public web, or null. */
export function secureUpgradeOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' || isLocalHost(parsed.hostname)) return null;
  parsed.protocol = 'https:';
  return parsed.href;
}

/**
 * Where a page's request should go instead, or null to let it through.
 * `allowsPlainHttp` is the user's saved choice for the HTTP origin.
 */
export function httpsUpgradeFor(
  url: string,
  enabled: boolean,
  allowsPlainHttp: (origin: string) => boolean | null | undefined,
): string | null {
  if (!enabled) return null;
  const secure = secureUpgradeOf(url);
  if (!secure) return null;
  const { origin } = new URL(url);
  // A site that sends `http://a` to `http://www.a` is one site to the person
  // who just agreed to use it, so it doesn't ask again for the other name.
  return allowsPlainHttp(origin) === true ||
    allowsPlainHttp(wwwSibling(origin)) === true
    ? null
    : secure;
}

/** The same origin with `www.` added, or taken away. */
export function wwwSibling(origin: string): string {
  const url = new URL(origin);
  url.hostname = url.hostname.startsWith('www.')
    ? url.hostname.slice(4)
    : `www.${url.hostname}`;
  return url.origin;
}

/** Plain addresses a popup already failed to reach over HTTPS. */
const plainPopupAddresses = new Set<string>();
/** Secure addresses being tried for a popup, and what it actually asked for. */
const popupAttempts = new Map<string, string>();

/** Whether a popup's request for this plain address should try HTTPS first. */
export function wantsSecurePopup(url: string): boolean {
  return !plainPopupAddresses.has(url);
}

export function popupUpgraded(plain: string, secure: string): void {
  popupAttempts.set(secure, plain);
}

/**
 * A popup failed to load `secure`. If that was HTTPS-only mode's own try, this
 * is the address to go to instead: a popup has nowhere to ask, and its title
 * already says "Not secure".
 */
export function popupFallback(secure: string, code: number): string | null {
  const plain = popupAttempts.get(secure);
  if (!plain || !fallsBackToHttp(code)) return null;
  popupAttempts.delete(secure);
  plainPopupAddresses.add(plain);
  return plain;
}

/**
 * A secure address that doesn't answer at all can keep a page waiting for
 * minutes, so after this long Splash stops and offers the HTTP one instead.
 */
export const SECURE_ATTEMPT_LIMIT_MS = 15_000;

const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * Typed without a scheme, an address already goes to HTTPS. That is Splash's
 * choice rather than the user's, so a failure may still offer HTTP. Returns
 * the plain form, or null for a search, a keyword or a typed `https://`.
 */
export function typedPlainAddress(
  input: string,
  resolved: string,
): string | null {
  const typed = input.trim();
  if (SCHEME.test(typed)) return null;
  try {
    return new URL(`https://${typed}`).href === resolved
      ? resolved.replace(/^https:/, 'http:')
      : null;
  } catch {
    return null;
  }
}

/** Failures that say nothing about HTTP: it would fail the same way. */
const NOT_ABOUT_HTTPS = new Set([
  -105, // ERR_NAME_NOT_RESOLVED
  -106, // ERR_INTERNET_DISCONNECTED: the page retries by itself
  -109, // ERR_ADDRESS_UNREACHABLE
  -137, // ERR_NAME_RESOLUTION_FAILED
]);
const ERR_TIMED_OUT = -7;
/** A site that sends HTTPS back to HTTP loops against the upgrade. */
const ERR_TOO_MANY_REDIRECTS = -310;
const ERR_INVALID_RESPONSE = -320;
const ERR_EMPTY_RESPONSE = -324;

/**
 * Whether a failed HTTPS load could still work over HTTP. Chromium numbers
 * connection errors -100 to -199 and certificate errors -200 to -299.
 */
export function fallsBackToHttp(code: number): boolean {
  if (NOT_ABOUT_HTTPS.has(code)) return false;
  return (
    (code <= -100 && code >= -299) ||
    code === ERR_TIMED_OUT ||
    code === ERR_TOO_MANY_REDIRECTS ||
    code === ERR_INVALID_RESPONSE ||
    code === ERR_EMPTY_RESPONSE
  );
}

/**
 * One page's current try at HTTPS in place of HTTP. It lasts for that
 * navigation only, so a site that loaded securely never offers HTTP later.
 */
export class SecureAttempt {
  private plain: string | null = null;
  private secure: string | null = null;

  /** The page is about to try `secure` in place of `plain`. */
  begin(plain: string, secure: string): void {
    this.plain = plain;
    this.secure = secure;
  }

  /** A navigation began; if it's another address, the attempt is over. */
  navigationStarted(url: string): void {
    if (url !== this.plain && url !== this.secure) this.end();
  }

  committed(): void {
    this.end();
  }

  /** The secure address answered, but with an error of its own: offer HTTP. */
  answeredWithError(status: number): string | null {
    if (status < 400) return null;
    const { plain } = this;
    this.end();
    return plain;
  }

  /** Whether a try at HTTPS is under way. */
  get active(): boolean {
    return this.plain !== null;
  }

  /** The address to offer after a failed load, if HTTP could help. */
  failed(code: number): string | null {
    const { plain } = this;
    this.end();
    return plain && fallsBackToHttp(code) ? plain : null;
  }

  private end(): void {
    this.plain = null;
    this.secure = null;
  }
}
