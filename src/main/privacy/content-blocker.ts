import {
  adsAndTrackingLists,
  fetchLists,
  fetchResources,
  FiltersEngine,
  fullLists,
  type Fetch,
} from '@ghostery/adblocker';
import type { Session } from 'electron';
import { parse } from 'tldts-experimental';
import type { ContentBlockingStatus } from '../../shared/types';

/** Filter lists older than this are downloaded again in the background. */
export const LIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** How often a failed download is retried and list age is checked. */
export const RETRY_DELAY = 10 * 60 * 1000;

/**
 * EasyList Cookie and uBlock Origin's cookie notice list. Use them without
 * scriptlets: some of those click "Accept" or set a consent cookie.
 */
export const COOKIE_NOTICE_LISTS = fullLists.filter(
  (url) => !adsAndTrackingLists.includes(url) && url.includes('cookie'),
);

/**
 * A page that exists only to ask for cookie consent, such as
 * consent.google.com or consent.youtube.com. The cookie lists hide that
 * question where sites embed it, and on its own page that leaves nothing at
 * all: a blank page with no way on. The question stays visible there.
 */
export function isConsentPage(url: string | null): boolean {
  if (!url) return false;
  return parse(url).subdomain === 'consent';
}

export interface BlockerOptions {
  /** Filter list URLs; the cookie notice lists if left out. */
  lists?: string[];
  /** Whether the lists' scriptlets run in pages. Off unless turned on. */
  scriptlets?: boolean;
}

/** Hiding styles and scriptlets for one page. */
export interface Cosmetics {
  styles: string;
  scripts: string[];
}

/** What a page reports about its DOM so more hiding rules can apply. */
export interface DomFeatures {
  classes?: string[];
  hrefs?: string[];
  ids?: string[];
}

export interface FilterListSource {
  /** The saved engine and when it was saved, or `null` if there is none. */
  readCache(): Promise<{ data: Uint8Array; savedAt: number } | null>;
  writeCache(data: Uint8Array): Promise<void>;
  /** Downloads a list; rejects for anything but a successful response. */
  fetch: Fetch;
  now(): number;
}

/**
 * Hiding rules from a set of filter lists, the cookie notice lists unless
 * told otherwise. It blocks nothing on the network: uBlock Origin does that,
 * and Splash has no request hooks (see helper-extension.ts).
 */
export class ContentBlocker {
  private engine: FiltersEngine | null = null;
  private status: ContentBlockingStatus = {
    state: 'loading',
    updatedAt: null,
    updateFailed: false,
  };
  private updating: Promise<void> | null = null;

  private readonly lists: string[];
  private readonly scriptlets: boolean;

  constructor(
    private readonly source: FilterListSource,
    { lists = COOKIE_NOTICE_LISTS, scriptlets = false }: BlockerOptions = {},
  ) {
    this.lists = lists;
    this.scriptlets = scriptlets;
  }

  /**
   * Loads the saved lists, or downloads them if there are none. Old lists
   * keep working while newer ones download; a failed download is retried.
   */
  async load(): Promise<void> {
    const cached = await this.source.readCache().catch(() => null);
    if (cached) {
      try {
        this.engine = FiltersEngine.deserialize(cached.data);
        this.status = {
          state: 'ready',
          updatedAt: cached.savedAt,
          updateFailed: false,
        };
        if (this.source.now() - cached.savedAt < LIST_MAX_AGE) return;
      } catch {
        // Saved by another engine version: download fresh lists instead.
      }
    }
    await this.update();
  }

  /** Downloads the lists again and starts using them. */
  update(): Promise<void> {
    this.updating ??= this.download().finally(() => {
      this.updating = null;
    });
    return this.updating;
  }

  /** Downloads newer lists once the ones in use are a week old. */
  async refreshIfStale(): Promise<void> {
    const { updatedAt } = this.status;
    if (updatedAt !== null && this.source.now() - updatedAt < LIST_MAX_AGE) {
      return;
    }
    await this.update();
  }

  private async download(): Promise<void> {
    if (!this.engine) {
      this.status = { state: 'loading', updatedAt: null, updateFailed: false };
    }
    try {
      const [lists, resources] = await Promise.all([
        fetchLists(this.source.fetch, this.lists),
        // uBlock Origin's scriptlets, for lists that run them.
        this.scriptlets ? fetchResources(this.source.fetch) : null,
      ]);
      const engine = FiltersEngine.parse(lists.join('\n'));
      if (resources) {
        engine.updateResources(resources, String(resources.length));
      }
      this.engine = engine;
      this.status = {
        state: 'ready',
        updatedAt: this.source.now(),
        updateFailed: false,
      };
      await this.source.writeCache(engine.serialize()).catch((error) => {
        console.error('Could not save the filter lists', error);
      });
    } catch (error) {
      console.error('Could not download the filter lists', error);
      // Lists that already work stay in use.
      this.status = this.engine
        ? { ...this.status, updateFailed: true }
        : { state: 'failed', updatedAt: null, updateFailed: true };
      throw error;
    }
  }

  getStatus(): ContentBlockingStatus {
    return this.status;
  }

  /**
   * Hiding rules for a page. The first call for a page load has no DOM
   * features; later calls add rules for classes and ids seen since.
   */
  cosmeticsFor(url: string, features?: DomFeatures): Cosmetics | null {
    if (!this.engine) return null;
    const { hostname, domain } = parse(url);
    const first = features === undefined;
    const { active, styles, scripts } = this.engine.getCosmeticsFilters({
      url,
      hostname: hostname ?? '',
      domain: domain ?? '',
      classes: features?.classes,
      hrefs: features?.hrefs,
      ids: features?.ids,
      getBaseRules: first,
      getInjectionRules: first && this.scriptlets,
      getExtendedRules: false,
      getRulesFromHostname: first,
      getRulesFromDOM: !first,
    });
    return active === false ? null : { styles, scripts };
  }
}

/**
 * One script that runs a page's scriptlets. Each scriptlet declares its
 * helpers (`safeSelf`, `proxyApplyFn`) at the top level. Run as separate
 * scripts, those become page globals that the next scriptlet replaces, and
 * the earlier wrappers then call themselves: on YouTube,
 * `Function.prototype.toString` overflowed the stack. Here each scriptlet
 * keeps its own helpers in its own block, and none reach the page.
 */
export function bundleScriptlets(scripts: readonly string[]): string | null {
  if (scripts.length === 0) return null;
  const blocks = scripts.map((script) => `try {\n${script}\n} catch {}`);
  return `(function () {\n${blocks.join('\n')}\n})();`;
}

/** What uBlock Origin says about one page and its site. */
export interface AdsOnPage {
  /** Requests blocked since the page last started loading. */
  blocked: number;
  /** Whether the site is trusted; null when nothing blocks ads. */
  allowed: boolean | null;
}

/** What the windows need from content blocking, which uBlock Origin does. */
export interface ContentBlocking {
  adsOn(pageId: string, origin: string): Promise<AdsOnPage>;
  /** Trusts a site in uBlock Origin, or stops trusting it, in one session. */
  setAdsAllowed(
    session: Session,
    origin: string,
    allowed: boolean,
  ): Promise<void>;
  getStatus(): Promise<ContentBlockingStatus>;
  /** Downloads every list again. */
  update(): Promise<void>;
}
