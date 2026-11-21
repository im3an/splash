/**
 * What Splash's helper extension does to requests, apart from Chrome's API so
 * it can be tested. The helper replaces Splash's `session.webRequest` hooks:
 * Electron gives extensions' `chrome.webRequest` listeners no requests while a
 * session has any listener of its own, and uBlock Origin needs them. Main
 * pushes these settings into the helper's background page, because its
 * listeners must answer at once and can't ask.
 */
import {
  requestedHints,
  withClientHints,
  type BrowserIdentity,
} from '../main/security/client-hints';
import { httpsUpgradeFor } from '../main/security/https-only';
import { webOrigin } from '../main/security/permissions';
import { dangerousSiteKey, isHostListed } from '../main/security/threat-list';
import {
  contentPolicyFor,
  isThirdParty,
  withoutCookie,
  withPrivacySignal,
} from '../main/privacy/site-rules';

/** The decisions about sites the helper enforces, as `getPermission` keeps them. */
export const HELPER_PERMISSIONS = [
  'javascript',
  'images',
  'third-party-cookies',
  'insecure',
  'dangerous',
] as const;
export type HelperPermission = (typeof HELPER_PERMISSIONS)[number];

/** By origin, what the user decided; a permission left out is undecided. */
export type HelperDecisions = Record<
  string,
  Partial<Record<HelperPermission, boolean>>
>;

export interface HelperSettings {
  privacySignal: boolean;
  blockThirdPartyCookies: boolean;
  httpsOnly: boolean;
  warnDangerousSites: boolean;
  identity: BrowserIdentity;
  decisions: HelperDecisions;
}

/** A header as `chrome.webRequest` hands it over. */
export interface Header {
  name: string;
  value?: string;
}

/** The parts of a `chrome.webRequest` event the rules look at. */
export interface RequestDetails {
  url: string;
  /** Chrome's names: `main_frame`, `sub_frame`, `script`, … */
  type: string;
  tabId: number;
  initiator?: string;
}

/** How many sites' `Accept-CH` answers are kept, oldest dropped first. */
const MAX_HINT_SITES = 500;
/** How many pages' current addresses are kept; closed tabs aren't reported. */
const MAX_TABS = 2000;
/** How many plain addresses popups fell back to are remembered. */
const MAX_PLAIN = 200;

function remember<K, V>(map: Map<K, V>, key: K, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value!);
}

function toRecord(headers: readonly Header[]): Record<string, string> {
  return Object.fromEntries(
    headers.map(({ name, value }) => [name, value ?? '']),
  );
}

function toList(headers: Record<string, string>): Header[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

export class HelperRules {
  /** Until main has sent its settings, every request goes through as it is. */
  private settings: HelperSettings | null = null;
  private dangerous: ReadonlySet<string> = new Set();
  /** Each tab's page: the address of its last main-frame response. */
  private readonly tops = new Map<number, string>();
  /** The hints each origin asked for with `Accept-CH` on its pages. */
  private readonly askedHints = new Map<string, Set<string>>();
  /** Plain addresses a tab's try at HTTPS failed for: let them through. */
  private readonly plain = new Map<string, number>();

  apply(settings: HelperSettings): void {
    this.settings = settings;
  }

  setDangerousHosts(hosts: readonly string[]): void {
    this.dangerous = new Set(hosts);
  }

  /** A popup's try at HTTPS failed: its plain address loads as it is. */
  allowPlain(tabId: number, url: string): void {
    remember(this.plain, `${tabId} ${url}`, tabId, MAX_PLAIN);
  }

  tabClosed(tabId: number): void {
    this.tops.delete(tabId);
  }

  private decision(url: string, permission: HelperPermission): boolean | null {
    const origin = webOrigin(url);
    if (!origin) return null;
    return this.settings?.decisions[origin]?.[permission] ?? null;
  }

  private blocks(url: string, permission: HelperPermission): boolean {
    return this.decision(url, permission) === false;
  }

  /** The page a request belongs to, whichever frame or worker made it. */
  private topOf(details: RequestDetails): string {
    if (details.type === 'main_frame') return details.url;
    return this.tops.get(details.tabId) ?? details.initiator ?? '';
  }

  private blocksThirdPartyOn(top: string): boolean {
    const decided = this.decision(top, 'third-party-cookies');
    return decided === null
      ? (this.settings?.blockThirdPartyCookies ?? false)
      : !decided;
  }

  private isBlockedThirdParty(details: RequestDetails): boolean {
    if (details.type === 'main_frame') return false;
    const top = this.topOf(details);
    return isThirdParty(details.url, top) && this.blocksThirdPartyOn(top);
  }

  /** Whether a page's address is reported as dangerous and not yet accepted. */
  isDangerous(url: string): boolean {
    if (!this.settings?.warnDangerousSites) return false;
    const key = dangerousSiteKey(url);
    if (!key || !isHostListed(this.dangerous, new URL(key).hostname)) {
      return false;
    }
    return this.decision(key, 'dangerous') !== true;
  }

  /** Where HTTPS-only mode sends a page's address instead, if anywhere. */
  upgradeOf(details: RequestDetails): string | null {
    const { settings } = this;
    if (!settings || details.type !== 'main_frame') return null;
    if (this.plain.has(`${details.tabId} ${details.url}`)) return null;
    return httpsUpgradeFor(details.url, settings.httpsOnly, (origin) =>
      this.decision(origin, 'insecure'),
    );
  }

  /** `onBeforeRequest`: a dangerous page stops here, a plain one goes secure. */
  beforeRequest(
    details: RequestDetails,
  ): { cancel: true } | { redirectUrl: string } | undefined {
    if (details.type !== 'main_frame') return undefined;
    // Main reads ERR_BLOCKED_BY_CLIENT on a listed address as this warning.
    if (this.isDangerous(details.url)) return { cancel: true };
    const secure = this.upgradeOf(details);
    return secure ? { redirectUrl: secure } : undefined;
  }

  /** `onBeforeSendHeaders`: client hints, the privacy signal, cookies. */
  beforeSendHeaders(
    details: RequestDetails & { requestHeaders?: Header[] },
  ): Header[] | undefined {
    const { settings } = this;
    if (!settings || !details.requestHeaders) return undefined;
    const before = toRecord(details.requestHeaders);
    let headers = withClientHints(
      before,
      details.url,
      settings.identity,
      this.hintsFor(details),
    );
    if (settings.privacySignal) headers = withPrivacySignal(headers);
    if (this.isBlockedThirdParty(details)) headers = withoutCookie(headers);
    return headers === before ? undefined : toList(headers);
  }

  /** `onHeadersReceived`: the site's rules for scripts and images, cookies. */
  headersReceived(
    details: RequestDetails & { responseHeaders?: Header[] },
  ): Header[] | undefined {
    if (!this.settings) return undefined;
    const original = details.responseHeaders ?? [];
    if (details.type === 'main_frame') this.rememberAskedHints(details);
    const isDocument =
      details.type === 'main_frame' || details.type === 'sub_frame';
    const top = this.topOf(details);
    const policy = isDocument
      ? contentPolicyFor({
          scripts: this.blocks(top, 'javascript'),
          images: this.blocks(top, 'images'),
        })
      : null;
    const dropCookies = this.isBlockedThirdParty(details);
    if (!policy && !dropCookies) return undefined;
    // Another header of its own: every policy a response carries applies, so
    // the site's own and uBlock Origin's stay as they are.
    const headers = dropCookies
      ? original.filter(({ name }) => name.toLowerCase() !== 'set-cookie')
      : [...original];
    if (policy)
      headers.push({ name: 'Content-Security-Policy', value: policy });
    return headers;
  }

  /** A tab's page is now the one at `url`. */
  responseStarted(details: RequestDetails): void {
    if (details.type !== 'main_frame' || details.tabId < 0) return;
    remember(this.tops, details.tabId, details.url, MAX_TABS);
  }

  private rememberAskedHints(
    details: RequestDetails & { responseHeaders?: Header[] },
  ): void {
    const origin = webOrigin(details.url);
    if (!origin) return;
    const acceptCh = (details.responseHeaders ?? [])
      .filter(({ name }) => name.toLowerCase() === 'accept-ch')
      .map(({ value }) => value ?? '');
    if (acceptCh.length === 0) return;
    remember(this.askedHints, origin, requestedHints(acceptCh), MAX_HINT_SITES);
  }

  /** Chrome sends what a site asked for to that site's own page, not others. */
  private hintsFor(details: RequestDetails): Set<string> | undefined {
    const origin = webOrigin(details.url);
    const asked = origin ? this.askedHints.get(origin) : undefined;
    if (!asked) return undefined;
    return webOrigin(this.topOf(details)) === origin ? asked : undefined;
  }
}
