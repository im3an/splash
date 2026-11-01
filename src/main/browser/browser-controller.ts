import { randomUUID } from 'node:crypto';
import type { Rectangle } from 'electron';
import {
  DEFAULT_APPEARANCE,
  newWorkspaceAppearance,
} from '../../shared/appearance';
import type {
  BrowserSnapshot,
  ClosedSummary,
  MoveOrigin,
  Notice,
  PageId,
  PageSnapshot,
  PermissionRequest,
  SitePermission,
  SplitView,
  TrailPosition,
  WorkspaceAppearance,
  WorkspaceId,
} from '../../shared/types';
import type { StoredPage, StoredSession } from '../storage/trail-store';
import type {
  ClosedPage,
  ClosedRecord,
  ClosedWorkspace,
} from './closed-records';
import { isSameDocumentUrl } from './link-activations';
import type {
  PageHistory,
  PageHost,
  PageHostFactory,
  PageRuntimeState,
} from './page-host';
import { splitBounds } from './layout';
import { TrailTree } from './trail-tree';
import { isPageUrl, resolveAddressInput } from './url';
import { stepZoom } from './zoom';
import type { SearchEngineId } from '../../shared/preferences';

interface Workspace {
  id: WorkspaceId;
  name: string;
  appearance: WorkspaceAppearance;
  tree: TrailTree;
  activePageId: PageId | null;
  /** Two pages shown side by side whenever either one is active. */
  split: SplitView | null;
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
  /** Kept at the top of the trail; closing puts it to sleep instead. */
  pinned: boolean;
  /** The last address the page actually committed, as opposed to requested. */
  committedUrl: string | null;
  /** Permission requests waiting for the user, oldest first. */
  permissionQueue: PendingPermission[];
  /** Permissions refused on the current site. */
  blocked: Set<SitePermission>;
}

interface PendingPermission {
  request: PermissionRequest;
  resolve(granted: boolean): void;
}

/** A page as the command palette lists it, from any workspace. */
export interface PageListing {
  id: PageId;
  workspaceId: WorkspaceId;
  workspaceName: string;
  title: string;
  url: string | null;
  faviconUrl: string | null;
  note: string | null;
  pinned: boolean;
  lastActiveAt: number;
}

export interface BrowserControllerOptions {
  createHost: PageHostFactory;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** A page committed a navigation to a new document. */
  onVisit?(url: string): void;
  /** A page reported the title of the document it shows. */
  onTitle?(url: string, title: string): void;
  /** A page reported the favicon of the document it shows. */
  onFavicon?(url: string, faviconUrl: string): void;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => string;
  now?: () => number;
  /** Live views kept before the least recently used are discarded. */
  maxLiveViews?: number;
  /** The engine typed searches go to. */
  searchEngine?: () => SearchEngineId;
  /** Something happened that the shell should confirm (a move, a copy). */
  onNotice?(notice: Notice): void;
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

/** How a page is named in confirmations: "Closed “Docs”." */
function nameOf(customTitle: string | null, state: PageRuntimeState): string {
  return (
    customTitle ||
    state.title ||
    (state.url ? new URL(state.url).host : 'New page')
  );
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
  isAudible: false,
  isMuted: false,
  zoomPercent: 100,
  find: null,
  isUnresponsive: false,
  hasFormEdits: false,
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
  /** Pages whose views are on screen: the active one, or a split's two. */
  private visibleIds = new Set<PageId>();
  private bounds: Rectangle | null = null;
  /** The whole window, for a page in full screen. */
  private windowBounds: Rectangle | null = null;
  /** The page showing a video (or anything else) in full screen. */
  private fullscreenId: PageId | null = null;
  /** The shell is showing something over the page area (a popover). */
  private overlayActive = false;
  /** Focus asked for while an overlay was closing, given once it's gone. */
  private focusWhenRevealed = false;
  private flushPending = false;
  private disposed = false;
  private readonly closingIds = new Set<PageId>();
  private closed: ClosedRecord[] = [];
  private closedSerial = 0;

  private readonly schedule: (flush: () => void) => void;
  private readonly createId: () => string;
  private readonly now: () => number;
  private maxLiveViews: number;

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

  hasPage(id: PageId): boolean {
    return this.pages.has(id);
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
          ? this.resolve(options.input)
          : null;
    if (url !== null) this.load(id, url, options.referrer);

    // Pages opened from either side of a split view open on its right, so
    // the left keeps its place while you follow links.
    const split = this.visibleSplit(workspace);
    if (activate && split && parentId !== null && inSplit(split, parentId)) {
      workspace.split = { leftId: split.leftId, rightId: id };
    }

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
    const split = this.visibleSplit(workspace);
    if (split)
      this.ensureLive(split.leftId === id ? split.rightId : split.leftId);
    this.syncVisibleHost();
    this.enforceLiveBudget();
    this.changed();
  }

  /**
   * Closes a page; its children move up to take its place. A pinned page
   * only goes to sleep, unless `unpin` says to close it anyway. Reopening
   * brings it back pinned.
   */
  closePage(
    id: PageId,
    { unpin = false }: { unpin?: boolean } = {},
  ): void | Promise<void> {
    if (!this.pages.has(id) || this.closingIds.has(id)) return;
    const page = this.require(id);
    const workspace = this.workspaceOf(id);
    if (
      page.pinned &&
      !unpin &&
      workspace.activePageId === id &&
      workspace.tree.successorOf(id) === null
    )
      return this.keepPinned(id);
    return this.guardRemoval([id], () => this.closePageNow(id, unpin));
  }

  private closePageNow(id: PageId, unpin: boolean): void {
    if (this.require(id).pinned && !unpin) return this.keepPinned(id);
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

  /** Closes a page together with every page beneath it, like `closePage`. */
  closeBranch(
    id: PageId,
    { unpin = false }: { unpin?: boolean } = {},
  ): void | Promise<void> {
    if (!this.pages.has(id) || this.closingIds.has(id)) return;
    if (this.require(id).pinned && !unpin) return this.closePage(id);
    return this.guardRemoval(this.workspaceOf(id).tree.branch(id), () =>
      this.closeBranchNow(id, unpin),
    );
  }

  private closeBranchNow(id: PageId, unpin: boolean): void {
    if (this.require(id).pinned && !unpin) return this.keepPinned(id);
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

  /**
   * Puts the most recently closed page, branch or workspace back where it
   * was. Returns the page that becomes active, if any.
   */
  reopenClosed(serial?: number): PageId | null {
    const index =
      serial === undefined
        ? this.closed.length - 1
        : this.closed.findIndex((record) => record.summary.serial === serial);
    if (index < 0) return null;
    const [record] = this.closed.splice(index, 1);
    if (!record) return null;
    let workspace = this.workspaces.get(record.workspaceId);
    if (!workspace && record.workspace) {
      workspace = this.addWorkspace(
        record.workspace.name,
        record.workspace.id,
        record.workspace.index,
      );
      workspace.createdAt = record.workspace.createdAt;
      workspace.appearance = record.workspace.appearance ?? DEFAULT_APPEARANCE;
    }
    workspace ??= this.workspace;
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
        pinned: closed.pinned ?? false,
        history: closed.history,
        createdAt: closed.createdAt,
        // Records saved by older versions may lack newer fields.
        state: {
          ...EMPTY_STATE,
          ...closed.state,
          isLoading: false,
          isAudible: false,
          isUnresponsive: false,
          find: null,
        },
      });
    }
    const root = record.pages[0];
    if (root && !record.workspace) {
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
    const remembered = record.workspace?.activePageId ?? null;
    workspace.activePageId =
      remembered !== null && tree.has(remembered)
        ? remembered
        : (tree.rootIds[0] ?? null);
    this.switchWorkspace(workspace.id);
    return workspace.activePageId;
  }

  /** What can be reopened, most recently closed first. */
  recentlyClosed(): ClosedSummary[] {
    return this.closed.map((record) => record.summary).reverse();
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

  /**
   * Pins a page, moving its branch to the top of the trail after the pages
   * already pinned, or unpins it, leaving it just below them. The shell
   * confirms with an undo. With `origin` (that undo), the page goes back to
   * where it was instead, without another confirmation.
   */
  setPinned(id: PageId, pinned: boolean, origin?: TrailPosition): void {
    const page = this.require(id);
    const { tree } = this.workspaceOf(id);
    const node = tree.get(id)!;
    const was: TrailPosition = {
      parentId: node.parentId,
      index: tree.indexOf(id),
    };
    const pinnedRoots = tree.rootIds.filter(
      (rootId) => rootId !== id && this.require(rootId).pinned,
    ).length;
    page.pinned = pinned;
    const canReturn =
      origin !== undefined &&
      (origin.parentId === null ||
        (tree.has(origin.parentId) && !tree.isWithin(origin.parentId, id)));
    if (canReturn) tree.move(id, origin.parentId, origin.index);
    else if (pinned || node.parentId === null) {
      tree.move(id, null, pinnedRoots);
    }
    if (origin === undefined) {
      this.options.onNotice?.({
        kind: 'pinned',
        pageId: id,
        label: nameOf(page.customTitle, page.state),
        pinned,
        origin: was,
      });
    }
    this.changed();
  }

  /** Opens a child, optionally loading its destination before activation. */
  createChildPage(parentId: PageId, input?: string): PageId {
    this.require(parentId);
    return this.createPage({ parentId, input });
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

  /**
   * Shows `id` beside `otherId` and makes it the active page. An ancestor
   * goes on the left, so a parent and its child read in trail order.
   */
  openSplit(id: PageId, otherId: PageId): void {
    const workspace = this.workspaceOf(id);
    if (id === otherId || !workspace.tree.has(otherId)) {
      throw new Error('A split view needs two pages of one workspace');
    }
    workspace.split = workspace.tree.isWithin(otherId, id)
      ? { leftId: id, rightId: otherId }
      : { leftId: otherId, rightId: id };
    this.activatePage(id);
  }

  /**
   * Closes the split view `id` is showing in, or opens one with the page it
   * is most related to: its parent, or else the child "forward" leads to.
   */
  toggleSplit(id: PageId): void {
    const workspace = this.workspaceOf(id);
    if (workspace.split && inSplit(workspace.split, id)) {
      this.closeSplit(workspace.id);
      return;
    }
    const related = this.relatedPageOf(id);
    if (related !== null) this.openSplit(id, related);
  }

  /** Ends a workspace's split view; its active page stays on screen. */
  closeSplit(workspaceId: WorkspaceId = this.activeWorkspaceId): void {
    const workspace = this.requireWorkspace(workspaceId);
    if (!workspace.split) return;
    workspace.split = null;
    this.syncVisibleHost();
    this.enforceLiveBudget();
    this.changed();
  }

  /** The page a split view would pair `id` with, if it has one. */
  relatedPageOf(id: PageId): PageId | null {
    const parentId = this.workspaceOf(id).tree.get(id)?.parentId ?? null;
    return parentId ?? this.forwardChildOf(id);
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
    this.load(id, this.resolve(input));
  }

  /** Changes how many pages stay awake, putting extra ones to sleep now. */
  setMaxLiveViews(count: number): void {
    this.maxLiveViews = Math.max(1, Math.trunc(count));
    this.enforceLiveBudget();
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

  reload(id: PageId, options: { ignoreCache?: boolean } = {}): void {
    const page = this.require(id);
    // After a failed load the committed entry is Chromium's error page, so
    // retry the address that failed rather than reloading the error.
    if (page.state.error) {
      this.load(id, page.state.error.url);
      return;
    }
    if (page.host) page.host.reload(options);
    else this.ensureLive(id);
  }

  print(id: PageId): void {
    this.require(id).host?.print();
  }

  /**
   * Activates the page `offset` rows away in the sidebar, wrapping around.
   * Pages inside collapsed branches are skipped, as they aren't shown.
   */
  activateAdjacent(offset: 1 | -1): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    const current = this.activePageId;
    const index = current === null ? -1 : rows.indexOf(current);
    const start = index === -1 ? (offset > 0 ? -1 : 0) : index;
    const next = rows[(start + offset + rows.length) % rows.length]!;
    if (next !== current) this.activatePage(next);
  }

  /** Activates the sidebar's nth row, counting from 1; `'last'` for the end. */
  activateRow(position: number | 'last'): void {
    const rows = this.visibleRows();
    const id = position === 'last' ? rows.at(-1) : rows[position - 1];
    if (id !== undefined && id !== this.activePageId) this.activatePage(id);
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

  /** Where the active page goes, and the whole window for full screen. */
  setContentBounds(bounds: Rectangle, windowBounds: Rectangle = bounds): void {
    this.bounds = bounds;
    this.windowBounds = windowBounds;
    this.syncVisibleHost();
  }

  focusActivePage(): void {
    // The shell animates an overlay out before the page returns.
    if (this.overlayActive) {
      this.focusWhenRevealed = true;
      return;
    }
    const activeId = this.activePageId;
    if (activeId !== null && this.visibleIds.has(activeId)) {
      this.require(activeId).host?.focus();
    }
  }

  /** Frees a page's view, keeping its address and history for later. */
  discard(id: PageId): void {
    const page = this.require(id);
    if (!page.host || page.state.hasFormEdits) return;
    page.history = page.host.captureHistory() ?? page.history;
    this.cancelPermissionRequests(page);
    page.host.destroy();
    page.host = null;
    if (this.fullscreenId === id) this.fullscreenId = null;
    page.state = {
      ...page.state,
      isLoading: false,
      isAudible: false,
      isUnresponsive: false,
      find: null,
    };
    this.visibleIds.delete(id);
    this.changed();
  }

  setMuted(id: PageId, muted: boolean): void {
    const page = this.require(id);
    if (page.host) page.host.setMuted(muted);
    else page.state = { ...page.state, isMuted: muted };
    this.changed();
  }

  /** Steps the page's zoom, or resets it to 100%. */
  zoom(id: PageId, direction: 'in' | 'out' | 'reset'): void {
    const page = this.require(id);
    const percent =
      direction === 'reset' ? 100 : stepZoom(page.state.zoomPercent, direction);
    page.host?.setZoomPercent(percent);
  }

  find(
    id: PageId,
    text: string,
    options: { forward: boolean; findNext: boolean },
  ): void {
    this.require(id).host?.find(text, options);
  }

  stopFind(id: PageId): void {
    this.require(id).host?.stopFind();
  }

  /** Stills of the pages on screen, for the shell to show under popovers. */
  async captureVisiblePages(): Promise<Record<PageId, string>> {
    const stills: Record<PageId, string> = {};
    await Promise.all(
      [...this.visibleIds].map(async (id) => {
        const still = await this.pages.get(id)?.host?.capture();
        if (still) stills[id] = still;
      }),
    );
    return stills;
  }

  /** While the shell shows a popover over the page area, the page steps aside. */
  setOverlayActive(active: boolean): void {
    this.overlayActive = active;
    this.syncVisibleHost();
    if (!active && this.focusWhenRevealed) {
      this.focusWhenRevealed = false;
      this.focusActivePage();
    }
  }

  /**
   * Answers a page's pending permission request. Answers for requests that
   * have meanwhile been cancelled are ignored.
   */
  respondToPermission(id: PageId, requestId: string, granted: boolean): void {
    const page = this.require(id);
    const index = page.permissionQueue.findIndex(
      (pending) => pending.request.id === requestId,
    );
    if (index === -1) return;
    const [pending] = page.permissionQueue.splice(index, 1);
    pending!.resolve(granted);
    this.changed();
  }

  /** Mutes or unmutes every live page on `origin`. */
  applySoundPolicy(origin: string, muted: boolean): void {
    for (const page of this.pages.values()) {
      if (page.host && page.state.url && originOf(page.state.url) === origin) {
        page.host.setMuted(muted);
      }
    }
  }

  /** Every page in every workspace, for search. */
  listPages(): PageListing[] {
    const listings: PageListing[] = [];
    for (const workspaceId of this.workspaceOrder) {
      const workspace = this.requireWorkspace(workspaceId);
      for (const id of workspace.tree.order()) {
        const page = this.require(id);
        listings.push({
          id,
          workspaceId,
          workspaceName: workspace.name,
          title: page.customTitle ?? page.state.title,
          url: page.state.url,
          faviconUrl: page.state.faviconUrl,
          note: page.note,
          pinned: page.pinned,
          lastActiveAt: page.lastActiveAt,
        });
      }
    }
    return listings;
  }

  // ── Workspaces ─────────────────────────────────────────────────────────

  createWorkspace(
    name?: string,
    appearance?: WorkspaceAppearance,
  ): WorkspaceId {
    const count = this.workspaces.size;
    const workspace = this.addWorkspace(
      cleanText(name ?? null) ?? `Workspace ${count + 1}`,
    );
    workspace.appearance = appearance ?? newWorkspaceAppearance(count);
    this.switchWorkspace(workspace.id);
    return workspace.id;
  }

  /** Changes a workspace's name and look together, as the editor saves them. */
  customizeWorkspace(
    id: WorkspaceId,
    name: string,
    appearance: WorkspaceAppearance,
  ): void {
    const workspace = this.requireWorkspace(id);
    workspace.name = cleanText(name) ?? workspace.name;
    workspace.appearance = appearance;
    this.changed();
  }

  /** The active workspace's look, which also decides the window's colours. */
  get activeAppearance(): WorkspaceAppearance {
    return this.workspace.appearance;
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

  /**
   * Deletes a workspace with all its pages; reopening closed pages brings
   * it back. The last workspace cannot go.
   */
  deleteWorkspace(id: WorkspaceId): void | Promise<void> {
    if (this.workspaces.size === 1)
      throw new Error('The last workspace cannot be deleted');
    const workspace = this.requireWorkspace(id);
    return this.guardRemoval(workspace.tree.order(), () =>
      this.deleteWorkspaceNow(id),
    );
  }

  private deleteWorkspaceNow(id: WorkspaceId): void {
    const workspace = this.requireWorkspace(id);
    if (this.workspaces.size === 1) {
      throw new Error('The last workspace cannot be deleted');
    }
    const index = this.workspaceOrder.indexOf(id);
    const pageIds = workspace.tree.order();
    this.remember(workspace, pageIds, [], {
      id,
      name: workspace.name,
      appearance: workspace.appearance,
      createdAt: workspace.createdAt,
      activePageId: workspace.activePageId,
      index,
    });
    for (const pageId of pageIds) this.release(pageId);
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

  /** Moves a workspace to `index` in the workspace list. */
  moveWorkspace(id: WorkspaceId, index: number): void {
    this.requireWorkspace(id);
    const order = this.workspaceOrder.filter((other) => other !== id);
    const target = Math.max(0, Math.min(order.length, Math.trunc(index)));
    order.splice(target, 0, id);
    this.workspaceOrder = order;
    this.changed();
  }

  /**
   * Moves a page with its branch to the end of another workspace and tells
   * the shell, which offers to go there or put it back.
   */
  movePageToWorkspace(id: PageId, targetId: WorkspaceId): void {
    const source = this.workspaceOf(id);
    const target = this.requireWorkspace(targetId);
    if (source === target) return;
    const node = source.tree.get(id)!;
    const origin: MoveOrigin = {
      workspaceId: source.id,
      parentId: node.parentId,
      index: source.tree.indexOf(id),
      wasActive: source.activePageId === id,
    };
    const page = this.require(id);
    const pageCount = this.transferBranch(id, target, null);
    this.options.onNotice?.({
      kind: 'moved',
      pageId: id,
      label: nameOf(page.customTitle, page.state),
      pageCount,
      workspaceId: target.id,
      workspaceName: target.name,
      origin,
    });
  }

  /**
   * Undoes a move to another workspace: the branch goes back where it was,
   * or to the end of the trail when its old parent has since closed.
   */
  returnPage(id: PageId, origin: MoveOrigin): void {
    const target = this.requireWorkspace(origin.workspaceId);
    const parentId =
      origin.parentId !== null && target.tree.has(origin.parentId)
        ? origin.parentId
        : null;
    if (this.workspaceOf(id) !== target) {
      this.transferBranch(id, target, parentId, origin.index);
    }
    if (!origin.wasActive) return;
    if (target.id === this.activeWorkspaceId) this.activatePage(id);
    else target.activePageId = id;
  }

  /** Moves a branch into another workspace; returns how many pages moved. */
  private transferBranch(
    id: PageId,
    target: Workspace,
    parentId: PageId | null,
    index?: number,
  ): number {
    const source = this.workspaceOf(id);
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
    if (
      source.split &&
      branch.some((pageId) => inSplit(source.split!, pageId))
    ) {
      source.split = null;
    }
    source.tree.removeBranch(id);
    for (const node of structure) {
      const isRoot = node.pageId === id;
      target.tree.add(
        node.pageId,
        isRoot ? parentId : node.parentId,
        isRoot ? index : undefined,
      );
      target.tree.setCollapsed(node.pageId, node.collapsed);
      this.require(node.pageId).workspaceId = target.id;
    }
    if (target.activePageId === null) target.activePageId = id;
    this.afterRemoval(source, successor);
    return branch.length;
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
          pinned: page.pinned,
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
          appearance: workspace.appearance,
          activePageId: workspace.activePageId,
          split: workspace.split,
          createdAt: workspace.createdAt,
        };
      }),
      pages,
      activeWorkspaceId: this.activeWorkspaceId,
      closed: [...this.closed],
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
      workspace.appearance = stored.appearance ?? DEFAULT_APPEARANCE;
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
        // Coming back to a saved page isn't a new visit.
        committedUrl: stored.url,
        customTitle: stored.customTitle,
        note: stored.note,
        pinned: stored.pinned,
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
      const split = stored.split ?? null;
      workspace.split =
        split &&
        split.leftId !== split.rightId &&
        workspace.tree.has(split.leftId) &&
        workspace.tree.has(split.rightId)
          ? split
          : null;
    }
    this.closed = [...(session.closed ?? [])].slice(-MAX_CLOSED_RECORDS);
    this.closedSerial = Math.max(
      0,
      ...this.closed.map((record) => record.summary.serial),
    );
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
        isPinned: page.pinned,
        blockedPermissions: [...page.blocked],
        permissionRequest: page.permissionQueue[0]?.request ?? null,
      };
    }
    return {
      pages,
      rootIds: [...workspace.tree.rootIds],
      activePageId: workspace.activePageId,
      split: workspace.split && { ...workspace.split },
      lastClosed: this.closed.at(-1)?.summary ?? null,
      workspaces: this.workspaceOrder.map((id) => {
        const other = this.requireWorkspace(id);
        return {
          id,
          name: other.name,
          pageCount: other.tree.size,
          appearance: other.appearance,
        };
      }),
      activeWorkspaceId: workspace.id,
    };
  }

  /** Also used before closing a window or quitting; leaves trail records intact. */
  async prepareWindowClose(): Promise<boolean> {
    return this.prepareClose([...this.pages.keys()]);
  }

  private guardRemoval(
    ids: PageId[],
    commit: () => void,
  ): void | Promise<void> {
    if (ids.some((id) => this.closingIds.has(id))) return;
    if (!ids.some((id) => this.pages.get(id)?.host?.requestClose))
      return commit();
    return this.prepareClose(ids).then((allowed) => {
      if (allowed && !this.disposed && ids.every((id) => this.pages.has(id)))
        commit();
    });
  }

  private async prepareClose(ids: PageId[]): Promise<boolean> {
    if (ids.some((id) => this.closingIds.has(id))) return false;
    ids.forEach((id) => this.closingIds.add(id));
    let allowed = false;
    try {
      for (const id of ids) {
        const page = this.pages.get(id);
        const host = page?.host;
        if (!page || !host?.requestClose) continue;
        // Capture before asking: an approved close destroys the native contents.
        const history = host.captureHistory();
        if (!(await host.requestClose())) return false;
        if (page.host === host) {
          page.history = history ?? page.history;
          page.host = null;
          host.destroy();
          this.visibleIds.delete(id);
          page.state = {
            ...page.state,
            isLoading: false,
            isAudible: false,
            hasFormEdits: false,
            find: null,
          };
        }
      }
      allowed = true;
      return true;
    } finally {
      ids.forEach((id) => this.closingIds.delete(id));
      // A canceled bulk close keeps every trail node. Restore approved views
      // from captured Chromium state if they were visible before cancellation.
      if (!allowed && !this.disposed) {
        const active = this.activePageId;
        if (active && this.pages.has(active)) this.activatePage(active);
        this.syncVisibleHost();
      }
      this.changed();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const page of this.pages.values()) page.host?.destroy();
    this.pages.clear();
    this.visibleIds.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private resolve(input: string): string {
    return resolveAddressInput(input, this.options.searchEngine?.());
  }

  private get workspace(): Workspace {
    return this.requireWorkspace(this.activeWorkspaceId);
  }

  private addWorkspace(
    name: string,
    id: WorkspaceId = this.createId(),
    index = this.workspaceOrder.length,
  ) {
    const workspace: Workspace = {
      id,
      name,
      appearance: DEFAULT_APPEARANCE,
      tree: new TrailTree(),
      activePageId: null,
      split: null,
      createdAt: this.now(),
    };
    this.workspaces.set(id, workspace);
    this.workspaceOrder.splice(index, 0, id);
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
      pinned: false,
      committedUrl: null,
      permissionQueue: [],
      blocked: new Set(),
    };
  }

  /** Refuses whatever a page was still asking for. */
  private cancelPermissionRequests(page: Page): void {
    const queue = page.permissionQueue;
    page.permissionQueue = [];
    for (const pending of queue) pending.resolve(false);
  }

  /** Records pages about to be closed so they can be reopened. */
  private remember(
    workspace: Workspace,
    ids: PageId[],
    promotedChildIds: PageId[],
    deletedWorkspace: ClosedWorkspace | null = null,
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
        pinned: page.pinned,
        state: page.state,
        history: page.host?.captureHistory() ?? page.history,
        createdAt: page.createdAt,
      };
    });
    const [first] = pages;
    if (!first && !deletedWorkspace) return;
    const label = deletedWorkspace
      ? deletedWorkspace.name
      : nameOf(first!.customTitle, first!.state);
    this.closed.push({
      workspaceId: workspace.id,
      workspace: deletedWorkspace,
      pages,
      promotedChildIds,
      summary: {
        kind: deletedWorkspace ? 'workspace' : 'pages',
        label,
        pageCount: pages.length,
        serial: ++this.closedSerial,
      },
    });
    if (this.closed.length > MAX_CLOSED_RECORDS) this.closed.shift();
  }

  /**
   * What closing does to a pinned page: it stays in the trail and goes to
   * sleep, while a neighbour takes its place on screen. The only page left
   * stays awake. The shell says why and offers to unpin and close it.
   */
  private keepPinned(id: PageId): void {
    const workspace = this.workspaceOf(id);
    const page = this.require(id);
    if (workspace.activePageId === id) {
      const neighbour =
        workspace.tree.branchSuccessorOf(id) ?? workspace.tree.successorOf(id);
      if (neighbour !== null) this.activatePage(neighbour);
    }
    const asleep = workspace.activePageId !== id;
    if (asleep) this.discard(id);
    this.options.onNotice?.({
      kind: 'kept-pinned',
      pageId: id,
      label: nameOf(page.customTitle, page.state),
      asleep,
    });
  }

  /** Destroys a page's view and forgets it. The tree is updated separately. */
  private release(id: PageId): void {
    const page = this.pages.get(id);
    if (page) {
      // A split view ends when either of its pages goes.
      const workspace = this.workspaces.get(page.workspaceId);
      if (workspace?.split && inSplit(workspace.split, id)) {
        workspace.split = null;
      }
    }
    this.visibleIds.delete(id);
    this.pages.delete(id);
    if (this.fullscreenId === id) this.fullscreenId = null;
    if (page) this.cancelPermissionRequests(page);
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
      pageId: id,
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
      onFocus: () => {
        // Clicking into the other side of a split view makes it active.
        if (
          isCurrent() &&
          this.activePageId !== id &&
          this.visibleIds.has(id)
        ) {
          this.activatePage(id);
        }
      },
      onNotice: (notice) => this.options.onNotice?.(notice),
      onFullscreenChange: (active) => {
        if (!isCurrent()) return;
        if (active) this.fullscreenId = id;
        else if (this.fullscreenId === id) this.fullscreenId = null;
        this.syncVisibleHost();
      },
      onPermissionRequest: (origin, permissions) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
          page.permissionQueue.push({
            request: { id: this.createId(), origin, permissions },
            resolve: (granted) => {
              if (!granted) for (const p of permissions) page.blocked.add(p);
              resolve(granted);
              this.changed();
            },
          });
          this.changed();
        });
      },
      onPermissionBlocked: (permissions) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return;
        for (const permission of permissions) page.blocked.add(permission);
        this.changed();
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
    if (!isPageUrl(url)) throw new Error(`Refusing to load ${url}`);
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
      .filter(
        ([id, page]) =>
          id !== activeId &&
          !this.visibleIds.has(id) &&
          !page.host?.isAudible() &&
          !page.state.hasFormEdits,
      )
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
    const url = page.state.url;
    // URLs from a host are committed navigations. Compare against the last
    // commit, not the address requested by `load`, which is set earlier.
    if (patch.url) {
      const previous = page.committedUrl;
      page.committedUrl = patch.url;
      if (originOf(patch.url) !== originOf(previous)) {
        // Requests and refusals belong to the site the page has left.
        this.cancelPermissionRequests(page);
        page.blocked.clear();
      }
      if (previous === null || !isSameDocumentUrl(patch.url, previous)) {
        this.options.onVisit?.(patch.url);
      }
    }
    if (patch.title && url) this.options.onTitle?.(url, patch.title);
    if (patch.faviconUrl && url) {
      this.options.onFavicon?.(url, patch.faviconUrl);
    }
    if ('error' in patch || 'url' in patch) this.syncVisibleHost();
    this.changed();
  }

  /**
   * Shows the active page's view, or both views of its split, wherever there
   * is real content to show. A page with no address or a failed load is
   * hidden so the shell can render its own surface in that space.
   */
  private syncVisibleHost(): void {
    if (this.disposed) return;
    const placements = new Map<PageId, Rectangle>();
    const activeId = this.activePageId;
    if (!this.overlayActive && this.bounds !== null && activeId !== null) {
      const split = this.visibleSplit(this.workspace);
      if (split) {
        const [left, right] = splitBounds(this.bounds);
        placements.set(split.leftId, left);
        placements.set(split.rightId, right);
      } else {
        placements.set(activeId, this.bounds);
      }
    }
    for (const [id] of placements) {
      const page = this.pages.get(id);
      const showable =
        page?.host != null &&
        page.state.url !== null &&
        page.state.error === null;
      if (!showable) placements.delete(id);
    }
    // A page in full screen covers the window, its split partner included.
    const fullscreen = this.fullscreenId;
    if (
      fullscreen !== null &&
      placements.has(fullscreen) &&
      this.windowBounds !== null
    ) {
      placements.clear();
      placements.set(fullscreen, this.windowBounds);
    }

    for (const id of this.visibleIds) {
      if (!placements.has(id)) this.pages.get(id)?.host?.hide();
    }
    for (const [id, bounds] of placements) {
      this.pages.get(id)?.host?.show(bounds);
    }
    this.visibleIds = new Set(placements.keys());
  }

  /** The active workspace's pages as the sidebar lists them. */
  private visibleRows(): PageId[] {
    const { tree } = this.workspace;
    const rows: PageId[] = [];
    const visit = (ids: readonly PageId[]) => {
      for (const id of ids) {
        rows.push(id);
        const node = tree.get(id);
        if (node && !node.collapsed) visit(node.childIds);
      }
    };
    visit(tree.rootIds);
    return rows;
  }

  /** The workspace's split view, if it is on screen. */
  private visibleSplit(workspace: Workspace): SplitView | null {
    const { split, activePageId } = workspace;
    return split && activePageId !== null && inSplit(split, activePageId)
      ? split
      : null;
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

function inSplit(split: SplitView, id: PageId): boolean {
  return split.leftId === id || split.rightId === id;
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Trims user-entered text; empty means "none". */
function cleanText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
