import { randomUUID } from 'node:crypto';
import type { Rectangle } from 'electron';
import type {
  BrowserSnapshot,
  ClosedSummary,
  PageId,
  PageSnapshot,
  WorkspaceId,
} from '../../shared/types';
import type { StoredPage, StoredSession } from '../storage/trail-store';
import { isSameDocumentUrl } from './link-activations';
import type {
  PageHistory,
  PageHost,
  PageHostFactory,
  PageRuntimeState,
} from './page-host';
import { TrailTree } from './trail-tree';
import { isNavigableUrl, resolveAddressInput } from './url';

interface Workspace {
  id: WorkspaceId;
  name: string;
  tree: TrailTree;
  activePageId: PageId | null;
  createdAt: number;
}

interface Page {
  workspaceId: WorkspaceId;
  /** `null` while the page has no live view: never loaded, or discarded. */
  host: PageHost | null;
  state: PageRuntimeState;
  /** Saved back/forward list of a discarded page. */
  history: PageHistory | null;
  createdAt: number;
  lastActiveAt: number;
  /** Where "forward" leads once this page's own history runs out. */
  lastVisitedChildId: PageId | null;
  /** A name the user gave the page, shown instead of its title. */
  customTitle: string | null;
  note: string | null;
}

/** Everything needed to put a closed page back where it was. */
interface ClosedPage {
  id: PageId;
  parentId: PageId | null;
  index: number;
  collapsed: boolean;
  customTitle: string | null;
  note: string | null;
  state: PageRuntimeState;
  history: PageHistory | null;
  createdAt: number;
}

interface ClosedRecord {
  workspaceId: WorkspaceId;
  /** The closed page first, then (for a branch) its descendants in order. */
  pages: ClosedPage[];
  /** Children promoted when only the page itself was closed. */
  promotedChildIds: PageId[];
  summary: ClosedSummary;
}

export interface BrowserControllerOptions {
  createHost: PageHostFactory;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** A page committed a navigation to a new document. */
  onVisit?(url: string): void;
  /** A page reported the title of the document it shows. */
  onTitle?(url: string, title: string): void;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => string;
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
  /** Position among siblings; defaults to after the last one. */
  index?: number;
  activate?: boolean;
  referrer?: string;
}

const DEFAULT_MAX_LIVE_VIEWS = 12;
const MAX_CLOSED_RECORDS = 25;
const DEFAULT_WORKSPACE_NAME = 'Personal';

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
 * Owns the trails of one window: workspaces and their page trees, each
 * page's live state, which pages have a live Chromium view, and which one is
 * on screen. Electron-specific work is delegated to `PageHost`s so this
 * class can be tested in plain Node.
 */
export class BrowserController {
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private workspaceOrder: WorkspaceId[] = [];
  private activeWorkspaceId: WorkspaceId;
  private readonly pages = new Map<PageId, Page>();
  private visibleId: PageId | null = null;
  private bounds: Rectangle | null = null;
  private flushPending = false;
  private disposed = false;
  private readonly closed: ClosedRecord[] = [];
  private closedSerial = 0;

  private readonly schedule: (flush: () => void) => void;
  private readonly createId: () => string;
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
    this.activeWorkspaceId = this.addWorkspace(DEFAULT_WORKSPACE_NAME).id;
  }

  get activePageId(): PageId | null {
    return this.workspace.activePageId;
  }

  get currentWorkspaceId(): WorkspaceId {
    return this.activeWorkspaceId;
  }

  // ── Pages ──────────────────────────────────────────────────────────────

  createPage(options: CreatePageOptions = {}): PageId {
    const { parentId = null, activate = true } = options;
    const workspace =
      parentId === null ? this.workspace : this.workspaceOf(parentId);
    const id = this.createId();
    workspace.tree.add(id, parentId, options.index);
    this.pages.set(id, this.newPage(workspace.id));

    const url =
      options.url !== undefined
        ? options.url
        : options.input !== undefined
          ? resolveAddressInput(options.input)
          : null;
    if (url !== null) this.load(id, url, options.referrer);

    if (activate || workspace.activePageId === null) this.activatePage(id);
    else {
      this.enforceLiveBudget();
      this.changed();
    }
    return id;
  }

  /** Shows a page, switching to its workspace if needed. */
  activatePage(id: PageId): void {
    const page = this.require(id);
    const workspace = this.requireWorkspace(page.workspaceId);
    this.activeWorkspaceId = workspace.id;
    workspace.activePageId = id;
    page.lastActiveAt = this.now();
    const parentId = workspace.tree.get(id)?.parentId ?? null;
    if (parentId !== null) this.require(parentId).lastVisitedChildId = id;
    workspace.tree.reveal(id);
    this.ensureLive(id);
    this.syncVisibleHost();
    this.enforceLiveBudget();
    this.changed();
  }

  /** Closes a page; its children move up to take its place. */
  closePage(id: PageId): void {
    const workspace = this.workspaceOf(id);
    const { tree } = workspace;
    this.remember(workspace, [id], [...(tree.get(id)?.childIds ?? [])]);
    const successor =
      workspace.activePageId === id
        ? tree.successorOf(id)
        : workspace.activePageId;
    tree.remove(id);
    this.release(id);
    this.afterRemoval(workspace, successor);
  }

  /** Closes a page together with every page beneath it. */
  closeBranch(id: PageId): void {
    const workspace = this.workspaceOf(id);
    const { tree } = workspace;
    const branch = tree.branch(id);
    this.remember(workspace, branch, []);
    const active = workspace.activePageId;
    const successor =
      active !== null && branch.includes(active)
        ? tree.branchSuccessorOf(id)
        : active;
    tree.removeBranch(id);
    for (const pageId of branch) this.release(pageId);
    this.afterRemoval(workspace, successor);
  }

  /** Puts the most recently closed page or branch back where it was. */
  reopenClosed(): PageId | null {
    const record = this.closed.pop();
    const root = record?.pages[0];
    if (!record || !root) return null;
    const workspace = this.workspaces.get(record.workspaceId) ?? this.workspace;
    const { tree } = workspace;
    for (const closed of record.pages) {
      const parentId =
        closed.parentId !== null && tree.has(closed.parentId)
          ? closed.parentId
          : null;
      tree.add(closed.id, parentId, closed.index);
      tree.setCollapsed(closed.id, closed.collapsed);
      this.pages.set(closed.id, {
        ...this.newPage(workspace.id),
        customTitle: closed.customTitle,
        note: closed.note,
        history: closed.history,
        createdAt: closed.createdAt,
        state: { ...closed.state, isLoading: false },
      });
    }
    // Children that were promoted when the page closed go back under it,
    // unless they have been moved somewhere else since.
    const rootParent = tree.get(root.id)?.parentId ?? null;
    for (const childId of record.promotedChildIds) {
      if (tree.get(childId)?.parentId === rootParent) {
        tree.move(childId, root.id, Number.MAX_SAFE_INTEGER);
      }
    }
    this.activatePage(root.id);
    return root.id;
  }

  /**
   * Moves a page and its branch under `parentId`, right after the sibling
   * `afterId` (or first, when `afterId` is null), within its workspace.
   */
  movePage(id: PageId, parentId: PageId | null, afterId: PageId | null): void {
    const { tree } = this.workspaceOf(id);
    if (parentId !== null && !tree.has(parentId)) {
      throw new Error(`${parentId} is not in the same workspace`);
    }
    if (parentId !== null && tree.isWithin(parentId, id)) {
      throw new Error('A page cannot move into its own branch');
    }
    const siblings = (
      parentId === null ? tree.rootIds : (tree.get(parentId)?.childIds ?? [])
    ).filter((sibling) => sibling !== id);
    let index = 0;
    if (afterId !== null) {
      const position = siblings.indexOf(afterId);
      if (position === -1) throw new Error(`${afterId} is not a sibling there`);
      index = position + 1;
    }
    tree.move(id, parentId, index);
    if (parentId !== null) tree.setCollapsed(parentId, false);
    this.changed();
  }

  /** Opens an empty page beneath `parentId`, ready for an address. */
  createChildPage(parentId: PageId): PageId {
    this.require(parentId);
    return this.createPage({ parentId });
  }

  /** A copy of a page, right after it, with the same history. */
  duplicatePage(id: PageId): PageId {
    const page = this.require(id);
    const { tree } = this.workspaceOf(id);
    const copyId = this.createId();
    tree.add(copyId, tree.get(id)?.parentId ?? null, tree.indexOf(id) + 1);
    this.pages.set(copyId, {
      ...this.newPage(page.workspaceId),
      customTitle: page.customTitle,
      note: page.note,
      history: page.host?.captureHistory() ?? page.history,
      state: { ...page.state, isLoading: false, error: null },
    });
    this.activatePage(copyId);
    return copyId;
  }

  /** Gives a page its own name; `null` goes back to the page's title. */
  renamePage(id: PageId, title: string | null): void {
    this.require(id).customTitle = cleanText(title);
    this.changed();
  }

  /** Attaches a short note to a page; `null` removes it. */
  setNote(id: PageId, note: string | null): void {
    this.require(id).note = cleanText(note);
    this.changed();
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
    const parentId = this.workspaceOf(id).tree.get(id)?.parentId ?? null;
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
    this.workspaceOf(id).tree.setCollapsed(id, collapsed);
    this.changed();
  }

  setContentBounds(bounds: Rectangle): void {
    this.bounds = bounds;
    this.syncVisibleHost();
  }

  focusActivePage(): void {
    const activeId = this.activePageId;
    if (activeId !== null && this.visibleId === activeId) {
      this.require(activeId).host?.focus();
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

  // ── Workspaces ─────────────────────────────────────────────────────────

  createWorkspace(name?: string): WorkspaceId {
    const workspace = this.addWorkspace(
      cleanText(name ?? null) ?? `Workspace ${this.workspaces.size + 1}`,
    );
    this.switchWorkspace(workspace.id);
    return workspace.id;
  }

  renameWorkspace(id: WorkspaceId, name: string): void {
    const clean = cleanText(name);
    if (clean) this.requireWorkspace(id).name = clean;
    this.changed();
  }

  switchWorkspace(id: WorkspaceId): void {
    const workspace = this.requireWorkspace(id);
    this.activeWorkspaceId = id;
    if (workspace.activePageId !== null) {
      this.activatePage(workspace.activePageId);
    } else {
      this.syncVisibleHost();
      this.changed();
    }
  }

  /** Deletes a workspace with all its pages. The last one cannot go. */
  deleteWorkspace(id: WorkspaceId): void {
    const workspace = this.requireWorkspace(id);
    if (this.workspaces.size === 1) {
      throw new Error('The last workspace cannot be deleted');
    }
    const index = this.workspaceOrder.indexOf(id);
    for (const pageId of workspace.tree.order()) this.release(pageId);
    this.workspaces.delete(id);
    this.workspaceOrder = this.workspaceOrder.filter((other) => other !== id);
    if (this.activeWorkspaceId === id) {
      const next =
        this.workspaceOrder[Math.min(index, this.workspaceOrder.length - 1)]!;
      this.switchWorkspace(next);
    } else {
      this.changed();
    }
  }

  /** Moves a page with its branch to the end of another workspace. */
  movePageToWorkspace(id: PageId, targetId: WorkspaceId): void {
    const source = this.workspaceOf(id);
    const target = this.requireWorkspace(targetId);
    if (source === target) return;
    const branch = source.tree.branch(id);
    const structure = branch.map((pageId) => {
      const node = source.tree.get(pageId)!;
      return { pageId, parentId: node.parentId, collapsed: node.collapsed };
    });
    const active = source.activePageId;
    const successor =
      active !== null && branch.includes(active)
        ? source.tree.branchSuccessorOf(id)
        : active;
    source.tree.removeBranch(id);
    for (const { pageId, parentId, collapsed } of structure) {
      target.tree.add(pageId, pageId === id ? null : parentId);
      target.tree.setCollapsed(pageId, collapsed);
      this.require(pageId).workspaceId = target.id;
    }
    if (target.activePageId === null) target.activePageId = id;
    this.afterRemoval(source, successor);
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  /** The state worth keeping across restarts, with live pages' history. */
  exportSession(): StoredSession {
    const pages: StoredPage[] = [];
    for (const workspaceId of this.workspaceOrder) {
      const { tree } = this.requireWorkspace(workspaceId);
      for (const id of tree.order()) {
        const page = this.require(id);
        const node = tree.get(id)!;
        pages.push({
          id,
          workspaceId,
          parentId: node.parentId,
          url: page.state.url,
          title: page.state.title,
          faviconUrl: page.state.faviconUrl,
          customTitle: page.customTitle,
          note: page.note,
          collapsed: node.collapsed,
          history: page.host?.captureHistory() ?? page.history,
          createdAt: page.createdAt,
          lastActiveAt: page.lastActiveAt,
        });
      }
    }
    return {
      workspaces: this.workspaceOrder.map((id) => {
        const workspace = this.requireWorkspace(id);
        return {
          id,
          name: workspace.name,
          activePageId: workspace.activePageId,
          createdAt: workspace.createdAt,
        };
      }),
      pages,
      activeWorkspaceId: this.activeWorkspaceId,
    };
  }

  /**
   * Replaces the current (empty) state with a saved session. Pages come
   * back without views; only the active one is loaded right away.
   */
  restoreSession(session: StoredSession): void {
    if (session.workspaces.length === 0) return;
    for (const pageId of this.pages.keys()) this.release(pageId);
    this.workspaces.clear();
    this.workspaceOrder = [];

    for (const stored of session.workspaces) {
      const workspace = this.addWorkspace(stored.name, stored.id);
      workspace.createdAt = stored.createdAt;
    }
    for (const stored of session.pages) {
      const workspace = this.workspaces.get(stored.workspaceId);
      if (!workspace || this.pages.has(stored.id)) continue;
      const parentId =
        stored.parentId !== null && workspace.tree.has(stored.parentId)
          ? stored.parentId
          : null;
      workspace.tree.add(stored.id, parentId);
      workspace.tree.setCollapsed(stored.id, stored.collapsed);
      this.pages.set(stored.id, {
        ...this.newPage(workspace.id),
        state: {
          ...EMPTY_STATE,
          url: stored.url,
          title: stored.title,
          faviconUrl: stored.faviconUrl,
        },
        history: stored.history,
        customTitle: stored.customTitle,
        note: stored.note,
        createdAt: stored.createdAt,
        lastActiveAt: stored.lastActiveAt,
      });
    }
    for (const stored of session.workspaces) {
      const workspace = this.workspaces.get(stored.id)!;
      workspace.activePageId =
        stored.activePageId !== null && workspace.tree.has(stored.activePageId)
          ? stored.activePageId
          : (workspace.tree.rootIds[0] ?? null);
    }
    const activeId =
      session.activeWorkspaceId !== null &&
      this.workspaces.has(session.activeWorkspaceId)
        ? session.activeWorkspaceId
        : this.workspaceOrder[0]!;
    this.switchWorkspace(activeId);
  }

  snapshot(): BrowserSnapshot {
    const workspace = this.workspace;
    const pages: Record<PageId, PageSnapshot> = {};
    for (const id of workspace.tree.order()) {
      const node = workspace.tree.get(id);
      const page = this.pages.get(id);
      if (!node || !page) continue;
      pages[id] = {
        id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        collapsed: node.collapsed,
        ...page.state,
        ...this.trailNavigation(id),
        isDiscarded: page.host === null && page.state.url !== null,
        customTitle: page.customTitle,
        note: page.note,
      };
    }
    return {
      pages,
      rootIds: [...workspace.tree.rootIds],
      activePageId: workspace.activePageId,
      lastClosed: this.closed.at(-1)?.summary ?? null,
      workspaces: this.workspaceOrder.map((id) => {
        const other = this.requireWorkspace(id);
        return { id, name: other.name, pageCount: other.tree.size };
      }),
      activeWorkspaceId: workspace.id,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const page of this.pages.values()) page.host?.destroy();
    this.pages.clear();
    this.visibleId = null;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private get workspace(): Workspace {
    return this.requireWorkspace(this.activeWorkspaceId);
  }

  private addWorkspace(name: string, id: WorkspaceId = this.createId()) {
    const workspace: Workspace = {
      id,
      name,
      tree: new TrailTree(),
      activePageId: null,
      createdAt: this.now(),
    };
    this.workspaces.set(id, workspace);
    this.workspaceOrder.push(id);
    return workspace;
  }

  private workspaceOf(id: PageId): Workspace {
    return this.requireWorkspace(this.require(id).workspaceId);
  }

  private requireWorkspace(id: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error(`Workspace ${id} does not exist`);
    return workspace;
  }

  /** Back/forward availability, counting steps along the trail. */
  private trailNavigation(id: PageId): {
    canGoBack: boolean;
    canGoForward: boolean;
  } {
    const page = this.pages.get(id);
    const node = page
      ? this.workspaces.get(page.workspaceId)?.tree.get(id)
      : undefined;
    if (!page || !node) return { canGoBack: false, canGoForward: false };
    const historyBack = page.host
      ? page.state.canGoBack
      : (page.history?.index ?? 0) > 0;
    const historyForward = page.host
      ? page.state.canGoForward
      : page.history !== null &&
        page.history.index < page.history.entries.length - 1;
    return {
      canGoBack: historyBack || node.parentId !== null,
      canGoForward: historyForward || this.forwardChildOf(id) !== null,
    };
  }

  private newPage(workspaceId: WorkspaceId): Page {
    const now = this.now();
    return {
      workspaceId,
      host: null,
      state: { ...EMPTY_STATE },
      history: null,
      createdAt: now,
      lastActiveAt: now,
      lastVisitedChildId: null,
      customTitle: null,
      note: null,
    };
  }

  /** Records pages about to be closed so they can be reopened. */
  private remember(
    workspace: Workspace,
    ids: PageId[],
    promotedChildIds: PageId[],
  ): void {
    const pages = ids.map((id): ClosedPage => {
      const node = workspace.tree.get(id);
      const page = this.require(id);
      return {
        id,
        parentId: node?.parentId ?? null,
        index: workspace.tree.indexOf(id),
        collapsed: node?.collapsed ?? false,
        customTitle: page.customTitle,
        note: page.note,
        state: page.state,
        history: page.host?.captureHistory() ?? page.history,
        createdAt: page.createdAt,
      };
    });
    const [first] = pages;
    if (!first) return;
    const label =
      first.customTitle ||
      first.state.title ||
      (first.state.url ? new URL(first.state.url).host : 'New page');
    this.closed.push({
      workspaceId: workspace.id,
      pages,
      promotedChildIds,
      summary: { label, pageCount: pages.length, serial: ++this.closedSerial },
    });
    if (this.closed.length > MAX_CLOSED_RECORDS) this.closed.shift();
  }

  /** Destroys a page's view and forgets it. The tree is updated separately. */
  private release(id: PageId): void {
    const page = this.pages.get(id);
    if (this.visibleId === id) this.visibleId = null;
    this.pages.delete(id);
    page?.host?.destroy();
  }

  private afterRemoval(workspace: Workspace, successor: PageId | null): void {
    workspace.activePageId =
      successor !== null && this.pages.has(successor) ? successor : null;
    if (workspace.id === this.activeWorkspaceId && workspace.activePageId) {
      this.activatePage(workspace.activePageId);
    } else {
      this.syncVisibleHost();
      this.changed();
    }
  }

  private forwardChildOf(id: PageId): PageId | null {
    const page = this.pages.get(id);
    const node = page
      ? this.workspaces.get(page.workspaceId)?.tree.get(id)
      : undefined;
    const remembered = page?.lastVisitedChildId ?? null;
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
      onNavigationCommand: (command) => {
        if (!isCurrent()) return;
        if (command === 'back') this.goBack(id);
        else if (command === 'forward') this.goForward(id);
        else this.reload(id);
      },
      navigationAvailability: () => this.trailNavigation(id),
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
    const activeId = this.activePageId;
    const candidates = live
      .filter(([id, page]) => id !== activeId && !page.host?.isAudible())
      .sort(([, a], [, b]) => a.lastActiveAt - b.lastActiveAt);
    for (const [id] of candidates) {
      if (excess-- <= 0) break;
      this.discard(id);
    }
  }

  private updateState(id: PageId, patch: Partial<PageRuntimeState>): void {
    const page = this.pages.get(id);
    if (!page) return;
    const previousUrl = page.state.url;
    page.state = { ...page.state, ...patch };
    const url = page.state.url;
    if (
      patch.url &&
      (previousUrl === null || !isSameDocumentUrl(patch.url, previousUrl))
    ) {
      this.options.onVisit?.(patch.url);
    }
    if (patch.title && url) this.options.onTitle?.(url, patch.title);
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
    const activeId = this.activePageId;
    const active = activeId === null ? undefined : this.pages.get(activeId);
    const shouldShow =
      active?.host != null &&
      this.bounds !== null &&
      active.state.url !== null &&
      active.state.error === null;
    const nextId = shouldShow ? activeId : null;

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

/** Trims user-entered text; empty means "none". */
function cleanText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
