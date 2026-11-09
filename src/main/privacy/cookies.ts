import { getDomain } from 'tldts-experimental';
import type { CookieDeletion, CookieSite } from '../../shared/types';

/** How long deleted cookies can still be brought back. */
const UNDO_WINDOW_MS = 60_000;

/** The parts of a cookie the viewer works with, as Electron describes them. */
export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  session?: boolean;
  /** Seconds since the epoch. */
  expirationDate?: number;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

export interface CookieJar {
  get(filter: Record<string, never>): Promise<StoredCookie[]>;
  remove(url: string, name: string): Promise<void>;
  set(details: {
    url: string;
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    expirationDate?: number;
    sameSite?: StoredCookie['sameSite'];
  }): Promise<void>;
  flushStore(): Promise<void>;
}

/** The site a host belongs to: `example.co.uk` for `www.example.co.uk`. */
export function siteOf(hostname: string): string {
  const host = hostname.replace(/^\./, '').toLowerCase();
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

function hostOf(cookie: StoredCookie): string {
  return (cookie.domain ?? '').replace(/^\./, '');
}

function urlOf(cookie: StoredCookie): string {
  const scheme = cookie.secure ? 'https' : 'http';
  return `${scheme}://${hostOf(cookie)}${cookie.path ?? '/'}`;
}

/** Cookies by site, biggest first. Values stay out: the viewer never shows them. */
export function groupCookies(cookies: readonly StoredCookie[]): CookieSite[] {
  const sites = new Map<string, CookieSite>();
  for (const cookie of cookies) {
    const site = siteOf(cookie.domain ?? '');
    if (!site) continue;
    const entry = sites.get(site) ?? { site, cookies: [] };
    entry.cookies.push({
      name: cookie.name,
      domain: cookie.domain ?? '',
      path: cookie.path ?? '/',
      secure: cookie.secure ?? false,
      httpOnly: cookie.httpOnly ?? false,
      expires:
        cookie.session || cookie.expirationDate === undefined
          ? null
          : Math.round(cookie.expirationDate * 1000),
    });
    sites.set(site, entry);
  }
  return [...sites.values()].sort(
    (a, b) =>
      b.cookies.length - a.cookies.length || a.site.localeCompare(b.site),
  );
}

export interface CookieViewerOptions {
  jar: CookieJar;
  now(): number;
  createToken(): string;
}

/** Lists the web session's cookies and deletes them by site or one at a time. */
export class CookieViewer {
  private disposed = false;
  private readonly undo = new Map<
    string,
    {
      cookies: StoredCookie[];
      expires: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly options: CookieViewerOptions) {}

  /** Releases values and timers when a private profile is discarded. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.undo.values()) clearTimeout(entry.timer);
    this.undo.clear();
  }

  /** Every site, or only the site that `host` belongs to. */
  async list(host?: string): Promise<CookieSite[]> {
    const sites = groupCookies(await this.options.jar.get({}));
    if (host === undefined) return sites;
    const wanted = siteOf(host);
    return sites.filter(({ site }) => site === wanted);
  }

  async delete(
    site: string,
    only?: { name: string; domain: string; path: string },
  ): Promise<CookieDeletion> {
    if (this.disposed) return { deleted: 0, undoToken: null };
    const { jar, now, createToken } = this.options;
    const stored = await jar.get({});
    const doomed = stored.filter(
      (cookie) =>
        siteOf(cookie.domain ?? '') === site &&
        (!only ||
          (cookie.name === only.name &&
            cookie.domain === only.domain &&
            cookie.path === only.path)),
    );
    await Promise.all(
      doomed.map((cookie) => jar.remove(urlOf(cookie), cookie.name)),
    );
    await jar.flushStore();
    if (this.disposed || doomed.length === 0)
      return { deleted: doomed.length, undoToken: null };
    const undoToken = createToken();
    // Expiry must release the saved values even when Undo is never pressed.
    const timer = setTimeout(() => this.undo.delete(undoToken), UNDO_WINDOW_MS);
    timer.unref?.();
    const previous = this.undo.get(undoToken);
    if (previous) clearTimeout(previous.timer);
    this.undo.set(undoToken, {
      cookies: doomed,
      expires: now() + UNDO_WINDOW_MS,
      timer,
    });
    return { deleted: doomed.length, undoToken };
  }

  /** Brings deleted cookies back, if it's still within the undo window. */
  async restore(token: string): Promise<boolean> {
    const entry = this.undo.get(token);
    this.undo.delete(token);
    if (entry) clearTimeout(entry.timer);
    if (!entry || entry.expires < this.options.now()) return false;
    const { jar } = this.options;
    await Promise.all(
      entry.cookies.map((cookie) =>
        jar.set({
          url: urlOf(cookie),
          name: cookie.name,
          value: cookie.value,
          // A host-only cookie must stay one, or subdomains would receive it.
          ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }),
        }),
      ),
    );
    await jar.flushStore();
    return true;
  }
}
