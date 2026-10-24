import { randomUUID } from 'node:crypto';
import type { Rectangle } from 'electron';
import type { BrowserSnapshot, PageId, PageSnapshot } from '../../shared/types';
import type { PageHost, PageHostFactory, PageRuntimeState } from './page-host';
import { TrailTree } from './trail-tree';
import { isNavigableUrl, resolveAddressInput } from './url';

interface Page {
  host: PageHost;
  state: PageRuntimeState;
}

export interface BrowserControllerOptions {
  createHost: PageHostFactory;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => PageId;
}

export interface CreatePageOptions {
  /** Address-bar input; resolved to a URL or a search. */
  input?: string;
  /** An already-validated http(s) URL. */
  url?: string;
  parentId?: PageId | null;
  activate?: boolean;
}

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
 * live state, and which page's view is on screen. Electron-specific work is
 * delegated to `PageHost`s so this class can be tested in plain Node.
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

  constructor(private readonly options: BrowserControllerOptions) {
    this.schedule = options.schedule ?? queueMicrotask;
    this.createId = options.createId ?? randomUUID;
  }

  get activePageId(): PageId | null {
    return this.activeId;
  }

  createPage(options: CreatePageOptions = {}): PageId {
    const { parentId = null, activate = true } = options;
    const id = this.createId();
    const host = this.options.createHost({
      onStateChange: (patch) => this.updateState(id, patch),
      onOpenRequest: (url, { background }) => {
        if (!this.pages.has(id)) return;
        this.createPage({ url, parentId: id, activate: !background });
      },
    });
    this.tree.add(id, parentId);
    this.pages.set(id, { host, state: { ...EMPTY_STATE } });

    const url =
      options.url !== undefined
        ? options.url
        : options.input !== undefined
          ? resolveAddressInput(options.input)
          : null;
    if (url !== null) this.load(id, url);

    if (activate || this.activeId === null) this.activatePage(id);
    else this.changed();
    return id;
  }

  activatePage(id: PageId): void {
    this.require(id);
    this.activeId = id;
    this.tree.reveal(id);
    this.syncVisibleHost();
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
    page.host.destroy();
    this.syncVisibleHost();
    this.changed();
  }

  navigate(id: PageId, input: string): void {
    this.require(id);
    this.load(id, resolveAddressInput(input));
  }

  goBack(id: PageId): void {
    this.require(id).host.goBack();
  }

  goForward(id: PageId): void {
    this.require(id).host.goForward();
  }

  reload(id: PageId): void {
    const page = this.require(id);
    // After a failed load the committed entry is Chromium's error page, so
    // retry the address that failed rather than reloading the error.
    if (page.state.error) this.load(id, page.state.error.url);
    else page.host.reload();
  }

  stop(id: PageId): void {
    this.require(id).host.stop();
  }

  toggleDevTools(id: PageId): void {
    this.require(id).host.toggleDevTools();
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
      this.require(this.activeId).host.focus();
    }
  }

  snapshot(): BrowserSnapshot {
    const pages: Record<PageId, PageSnapshot> = {};
    for (const id of this.tree.order()) {
      const node = this.tree.get(id);
      const page = this.pages.get(id);
      if (!node || !page) continue;
      pages[id] = {
        id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        collapsed: node.collapsed,
        ...page.state,
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
    for (const page of this.pages.values()) page.host.destroy();
    this.pages.clear();
    this.visibleId = null;
  }

  private load(id: PageId, url: string): void {
    if (!isNavigableUrl(url)) throw new Error(`Refusing to load ${url}`);
    const page = this.require(id);
    page.state = { ...page.state, url, error: null, isLoading: true };
    page.host.load(url);
    this.syncVisibleHost();
    this.changed();
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
      this.activeId === null ? null : this.pages.get(this.activeId);
    const shouldShow =
      active !== undefined &&
      active !== null &&
      this.bounds !== null &&
      active.state.url !== null &&
      active.state.error === null;
    const nextId = shouldShow ? this.activeId : null;

    if (this.visibleId !== null && this.visibleId !== nextId) {
      this.pages.get(this.visibleId)?.host.hide();
    }
    if (nextId !== null && active && this.bounds) {
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
