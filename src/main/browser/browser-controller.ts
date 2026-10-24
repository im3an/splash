import { randomUUID } from 'node:crypto';
import type { Rectangle } from 'electron';
import type { BrowserSnapshot, PageId, PageSnapshot } from '../../shared/types';
import type {
  PageHistory,
  PageHost,
  PageHostFactory,
  PageRuntimeState,
} from './page-host';
import { TrailTree } from './trail-tree';
import { isNavigableUrl, resolveAddressInput } from './url';

interface Page {
  /** `null` while the page has no live view: never loaded, or discarded. */
  host: PageHost | null;
  state: PageRuntimeState;
  /** Saved back/forward list of a discarded page. */
  history: PageHistory | null;
  lastActiveAt: number;
  /** Where "forward" leads once this page's own history runs out. */
  lastVisitedChildId: PageId | null;
}

export interface BrowserControllerOptions {
  createHost: PageHostFactory;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => PageId;
  now?: () => number;
  /** Live views kept before the least recently used are discarded. */
  maxLiveViews?: number;
}

export interface CreatePageOptions {
  /** Address-bar input; resolved to a URL or a search. */
  input?: string;
  /** An already-validated http(s) URL. */
  url?: string;
  parentId?: PageId | null;
  activate?: boolean;
  referrer?: string;
}

const DEFAULT_MAX_LIVE_VIEWS = 12;

const EMPTY_STATE: PageRuntimeState = {
  url: null,
  title: '',
  faviconUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  error: null,
};

/**
 * Owns the trail of pages for one window: the tree structure, each page's
 * live state, which pages have a live Chromium view, and which one is on
 * screen. Electron-specific work is delegated to `PageHost`s so this class
 * can be tested in plain Node.
 */
export class BrowserController {
  private readonly tree = new TrailTree();
  private readonly pages = new Map<PageId, Page>();
  private activeId: PageId | null = null;
  private visibleId: PageId | null = null;
  private bounds: Rectangle | null = null;
  private flushPending = false;
  private disposed = false;

  private readonly schedule: (flush: () => void) => void;
  private readonly createId: () => PageId;
  private readonly now: () => number;
  private readonly maxLiveViews: number;

  constructor(private readonly options: BrowserControllerOptions) {
    this.schedule = options.schedule ?? queueMicrotask;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? Date.now;
    this.maxLiveViews = Math.max(
      1,
      options.maxLiveViews ?? DEFAULT_MAX_LIVE_VIEWS,
    );
  }

  get activePageId(): PageId | null {
    return this.activeId;
  }

  createPage(options: CreatePageOptions = {}): PageId {
    const { parentId = null, activate = true } = options;
    const id = this.createId();
    this.tree.add(id, parentId);
    this.pages.set(id, {
      host: null,
      state: { ...EMPTY_STATE },
      history: null,
      lastActiveAt: this.now(),
      lastVisitedChildId: null,
    });

    const url =
      options.url !== undefined
        ? options.url
        : options.input !== undefined
          ? resolveAddressInput(options.input)
          : null;
    if (url !== null) this.load(id, url, options.referrer);

    if (activate || this.activeId === null) this.activatePage(id);
    else {
      this.enforceLiveBudget();
      this.changed();
    }
    return id;
  }

  activatePage(id: PageId): void {
    const page = this.require(id);
    this.activeId = id;
    page.lastActiveAt = this.now();
    const parentId = this.tree.get(id)?.parentId ?? null;
    if (parentId !== null) this.require(parentId).lastVisitedChildId = id;
    this.tree.reveal(id);
    this.ensureLive(id);
    this.syncVisibleHost();
    this.enforceLiveBudget();
    this.changed();
  }

  closePage(id: PageId): void {
    const page = this.require(id);
    if (this.activeId === id) {
      this.activeId = this.tree.successorOf(id);
    }
    if (this.visibleId === id) this.visibleId = null;
    this.tree.remove(id);
    this.pages.delete(id);
    page.host?.destroy();
    if (this.activeId !== null) this.activatePage(this.activeId);
    else {
      this.syncVisibleHost();
      this.changed();
    }
  }

  navigate(id: PageId, input: string): void {
    this.require(id);
    this.load(id, resolveAddressInput(input));
  }

  /** Back within the page's history, then up the trail to its parent. */
  goBack(id: PageId): void {
    const page = this.require(id);
    if (page.host && page.state.canGoBack) {
      page.host.goBack();
      return;
    }
    const parentId = this.tree.get(id)?.parentId ?? null;
    if (parentId !== null) this.activatePage(parentId);
  }

  /** Forward within the page's history, then down to the last child visited. */
  goForward(id: PageId): void {
    const page = this.require(id);
    if (page.host && page.state.canGoForward) {
      page.host.goForward();
      return;
    }
    const childId = this.forwardChildOf(id);
    if (childId !== null) this.activatePage(childId);
  }

  reload(id: PageId): void {
    const page = this.require(id);
    // After a failed load the committed entry is Chromium's error page, so
    // retry the address that failed rather than reloading the error.
    if (page.state.error) {
      this.load(id, page.state.error.url);
      return;
    }
    if (page.host) page.host.reload();
    else this.ensureLive(id);
  }

  stop(id: PageId): void {
    this.require(id).host?.stop();
  }

  toggleDevTools(id: PageId): void {
    this.require(id).host?.toggleDevTools();
  }

  setCollapsed(id: PageId, collapsed: boolean): void {
    this.require(id);
    this.tree.setCollapsed(id, collapsed);
    this.changed();
  }

  setContentBounds(bounds: Rectangle): void {
    this.bounds = bounds;
    this.syncVisibleHost();
  }

  focusActivePage(): void {
    if (this.activeId !== null && this.visibleId === this.activeId) {
      this.require(this.activeId).host?.focus();
    }
  }

  /** Frees a page's view, keeping its address and history for later. */
  discard(id: PageId): void {
    const page = this.require(id);
    if (!page.host) return;
    page.history = page.host.captureHistory() ?? page.history;
    page.host.destroy();
    page.host = null;
    page.state = { ...page.state, isLoading: false };
    if (this.visibleId === id) this.visibleId = null;
    this.changed();
  }

  snapshot(): BrowserSnapshot {
    const pages: Record<PageId, PageSnapshot> = {};
    for (const id of this.tree.order()) {
      const node = this.tree.get(id);
      const page = this.pages.get(id);
      if (!node || !page) continue;
      const historyBack = page.host
        ? page.state.canGoBack
        : (page.history?.index ?? 0) > 0;
      const historyForward = page.host
        ? page.state.canGoForward
        : page.history !== null &&
          page.history.index < page.history.entries.length - 1;
      pages[id] = {
        id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        collapsed: node.collapsed,
        ...page.state,
        canGoBack: historyBack || node.parentId !== null,
        canGoForward: historyForward || this.forwardChildOf(id) !== null,
        isDiscarded: page.host === null && page.state.url !== null,
      };
    }
    return {
      pages,
      rootIds: [...this.tree.rootIds],
      activePageId: this.activeId,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const page of this.pages.values()) page.host?.destroy();
    this.pages.clear();
    this.visibleId = null;
  }

  private forwardChildOf(id: PageId): PageId | null {
    const node = this.tree.get(id);
    const remembered = this.pages.get(id)?.lastVisitedChildId ?? null;
    if (remembered !== null && node?.childIds.includes(remembered)) {
      return remembered;
    }
    return node?.childIds[0] ?? null;
  }

  private spawnHost(id: PageId): PageHost {
    // Events from a host that has since been discarded or closed are stale.
    const isCurrent = () => this.pages.get(id)?.host === host;
    const host: PageHost = this.options.createHost({
      onStateChange: (patch) => {
        if (isCurrent()) this.updateState(id, patch);
      },
      onOpenRequest: (url, { background }) => {
        if (isCurrent()) {
          this.createPage({ url, parentId: id, activate: !background });
        }
      },
      onBranchRequest: (url, referrer) => {
        if (isCurrent()) this.createPage({ url, parentId: id, referrer });
      },
    });
    return host;
  }

  /** Gives a page a live view again, restoring its history if it had one. */
  private ensureLive(id: PageId): void {
    const page = this.require(id);
    if (page.host) return;
    if (page.history) {
      page.host = this.spawnHost(id);
      page.host.restoreHistory(page.history);
      page.history = null;
      page.state = { ...page.state, isLoading: true };
    } else if (page.state.url !== null && page.state.error === null) {
      page.host = this.spawnHost(id);
      page.host.load(page.state.url);
      page.state = { ...page.state, isLoading: true };
    }
  }

  private load(id: PageId, url: string, referrer?: string): void {
    if (!isNavigableUrl(url)) throw new Error(`Refusing to load ${url}`);
    const page = this.require(id);
    page.host ??= this.spawnHost(id);
    page.history = null;
    page.state = { ...page.state, url, error: null, isLoading: true };
    page.host.load(url, referrer === undefined ? undefined : { referrer });
    this.syncVisibleHost();
    this.changed();
  }

  /** Discards the least recently used views beyond the budget. */
  private enforceLiveBudget(): void {
    const live = [...this.pages.entries()].filter(([, page]) => page.host);
    let excess = live.length - this.maxLiveViews;
    if (excess <= 0) return;
    const candidates = live
      .filter(([id, page]) => id !== this.activeId && !page.host?.isAudible())
      .sort(([, a], [, b]) => a.lastActiveAt - b.lastActiveAt);
    for (const [id] of candidates) {
      if (excess-- <= 0) break;
      this.discard(id);
    }
  }

  private updateState(id: PageId, patch: Partial<PageRuntimeState>): void {
    const page = this.pages.get(id);
    if (!page) return;
    page.state = { ...page.state, ...patch };
    if ('error' in patch || 'url' in patch) this.syncVisibleHost();
    this.changed();
  }

  /**
   * Shows the active page's view when there is real content to show. A page
   * with no address or a failed load is hidden so the shell can render its
   * own surface in that space.
   */
  private syncVisibleHost(): void {
    if (this.disposed) return;
    const active =
      this.activeId === null ? undefined : this.pages.get(this.activeId);
    const shouldShow =
      active?.host != null &&
      this.bounds !== null &&
      active.state.url !== null &&
      active.state.error === null;
    const nextId = shouldShow ? this.activeId : null;

    if (this.visibleId !== null && this.visibleId !== nextId) {
      this.pages.get(this.visibleId)?.host?.hide();
    }
    if (nextId !== null && active?.host && this.bounds) {
      active.host.show(this.bounds);
    }
    this.visibleId = nextId;
  }

  private changed(): void {
    if (this.flushPending || this.disposed) return;
    this.flushPending = true;
    this.schedule(() => {
      this.flushPending = false;
      if (!this.disposed) this.options.onSnapshot(this.snapshot());
    });
  }

  private require(id: PageId): Page {
    const page = this.pages.get(id);
    if (!page) throw new Error(`Page ${id} does not exist`);
    return page;
  }
}
