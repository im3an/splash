import {
  adsAndTrackingLists,
  Config,
  fetchLists,
  fetchResources,
  FiltersEngine,
  fullLists,
  Request,
  type Fetch,
} from '@ghostery/adblocker';
import { parse } from 'tldts-experimental';
import type { ContentBlockingStatus } from '../../shared/types';
import { STAND_IN_SECRET, standInBody, standInUrl } from './stand-ins';

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

export interface BlockerOptions {
  /** Filter list URLs; ads and trackers if left out. */
  lists?: string[];
  /** Whether the lists' scriptlets run in pages. On unless turned off. */
  scriptlets?: boolean;
  /** The host stand-ins are served under; this launch's secret if left out. */
  standInSecret?: string;
}

/** The parts of a web request that blocking looks at. */
export interface BlockableRequest {
  id: number;
  url: string;
  resourceType?: string;
  referrer: string;
}

export interface BlockingResponse {
  cancel?: boolean;
  redirectURL?: string;
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

function requestFor(details: BlockableRequest, pageUrl: string | null) {
  const request = Request.fromRawDetails({
    requestId: String(details.id),
    url: details.url,
    sourceUrl: pageUrl ?? details.referrer,
    type: (details.resourceType ?? 'other') as never,
  });
  if (request.type === 'other') request.guessTypeOfRequest();
  return request;
}

/**
 * Blocks what a set of filter lists names: ads and trackers by default, or
 * cookie notices with `COOKIE_NOTICE_LISTS`. Until the lists have loaded,
 * every request goes through.
 */
/**
 * The lists' `$removeparam` rules on their own, unoptimised. Ghostery's
 * optimiser fuses rules that differ only in the parameter into one, which keeps
 * the first rule's parameter only (2.20.3 still does). Unoptimised, they cost
 * about 10 µs a request, so only addresses you go to are cleaned.
 */
function trackingParameters(engine: FiltersEngine): FiltersEngine {
  return new FiltersEngine({
    networkFilters: engine.removeparams.getFilters(),
    config: new Config({ ...engine.config, enableOptimizations: false }),
  });
}

export class ContentBlocker {
  private engine: FiltersEngine | null = null;
  private parameters: FiltersEngine | null = null;
  private status: ContentBlockingStatus = {
    state: 'loading',
    updatedAt: null,
    updateFailed: false,
  };
  private updating: Promise<void> | null = null;
  /** Requests blocked since each page last started loading. */
  private readonly blocked = new Map<string, number>();

  private readonly lists: string[];
  private readonly standInSecret: string;
  private readonly scriptlets: boolean;

  constructor(
    private readonly source: FilterListSource,
    {
      lists = adsAndTrackingLists,
      scriptlets = true,
      standInSecret = STAND_IN_SECRET,
    }: BlockerOptions = {},
  ) {
    this.lists = lists;
    this.scriptlets = scriptlets;
    this.standInSecret = standInSecret;
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
        this.parameters = trackingParameters(this.engine);
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
        // uBlock Origin's scriptlets and the stand-ins for blocked scripts.
        fetchResources(this.source.fetch),
      ]);
      const engine = FiltersEngine.parse(lists.join('\n'));
      engine.updateResources(resources, String(resources.length));
      this.engine = engine;
      this.parameters = trackingParameters(engine);
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

  /** The answer for one request from a page where blocking is on. */
  onRequest(
    details: BlockableRequest,
    pageId: string | null,
    pageUrl: string | null,
  ): BlockingResponse {
    if (details.resourceType === 'mainFrame') {
      if (pageId) this.blocked.delete(pageId);
      return {};
    }
    if (!this.engine) return {};
    const { match, redirect, filter } = this.engine.match(
      requestFor(details, pageUrl),
    );
    if (!match && !redirect) return {};
    if (pageId) this.blocked.set(pageId, (this.blocked.get(pageId) ?? 0) + 1);
    return redirect && filter
      ? {
          redirectURL: standInUrl(
            this.standInSecret,
            filter.getRedirectResource(),
          ),
        }
      : { cancel: true };
  }

  /** The resource a stand-in address names, ready to answer with. */
  standIn(name: string): ReturnType<typeof standInBody> | null {
    if (!this.engine) return null;
    return standInBody(this.engine.resources.getResource(name));
  }

  /**
   * A page's address without the tracking parameters the lists name
   * (`$removeparam`, such as `fbclid` and `gclid`), or null if it has none.
   */
  cleanedAddress(details: BlockableRequest): string | null {
    if (!this.engine || !this.parameters) return null;
    const request = requestFor(details, details.url);
    const { match, redirect } = this.engine.match(request);
    if (match || redirect) return null;
    return this.parameters.match(request).rewrite?.url ?? null;
  }

  /** Extra Content-Security-Policy directives for a document, if any. */
  cspFor(details: BlockableRequest): string | undefined {
    if (!this.engine) return undefined;
    if (
      details.resourceType !== 'mainFrame' &&
      details.resourceType !== 'subFrame'
    ) {
      return undefined;
    }
    return this.engine.getCSPDirectives(requestFor(details, null));
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

  blockedOn(pageId: string): number {
    return this.blocked.get(pageId) ?? 0;
  }

  forget(pageId: string): void {
    this.blocked.delete(pageId);
  }
}

/** One status for several blockers: the least ready one and its oldest lists. */
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

export function combinedStatus(
  statuses: ContentBlockingStatus[],
): ContentBlockingStatus {
  const state = statuses.some((status) => status.state === 'failed')
    ? 'failed'
    : statuses.some((status) => status.state === 'loading')
      ? 'loading'
      : 'ready';
  const dates = statuses.map((status) => status.updatedAt);
  return {
    state,
    updatedAt:
      state === 'ready' && !dates.includes(null)
        ? Math.min(...(dates as number[]))
        : null,
    updateFailed: statuses.some((status) => status.updateFailed),
  };
}

/** What the windows need from content blocking. */
export interface ContentBlocking {
  /** Requests blocked since the page last started loading. */
  blockedOn(pageId: string): number;
  getStatus(): ContentBlockingStatus;
  /** Downloads every list again. */
  update(): Promise<void>;
}
