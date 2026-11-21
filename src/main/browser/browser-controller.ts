import { randomUUID } from 'node:crypto';
import type { Rectangle } from 'electron';
import {
  accentColors,
  appearanceColors,
  DEFAULT_APPEARANCE,
  newWorkspaceAppearance,
} from '../../shared/appearance';
import type {
  BrowserSnapshot,
  ClosedSummary,
  MoveOrigin,
  Notice,
  GroupIcon,
  PageGroup,
  PageId,
  PageSnapshot,
  PermissionRequest,
  SitePermission,
  SystemPermission,
  SplitView,
  TrailPosition,
  WorkspaceAppearance,
  WorkspaceId,
} from '../../shared/types';
import type { StoredPage, StoredSession } from '../storage/trail-store';
import type {
  ClosedPage,
  ClosedGroup,
  ClosedRecord,
  ClosedWorkspace,
} from './closed-records';
import { isSameDocumentUrl } from './link-activations';
import type {
  PageDownload,
  PageHistory,
  PageHost,
  PageHostFactory,
  PageRuntimeState,
} from './page-host';
import { splitBounds } from './layout';
import { liveLimit, type MemoryPressure } from './memory-pressure';
import { TrailTree } from './trail-tree';
import { secureUpgradeOf, typedPlainAddress } from '../security/https-only';
import { canContinuePastCertificate } from '../../shared/certificate-errors';
import { pagesBelow, type TrailShape } from '../../shared/pages-below';
import { trailSummaries } from '../../shared/trail-summary';
import type { OutlineItem, TrailOutline } from '../transfer/trail-markdown';
import {
  isNavigableUrl,
  isPageUrl,
  resolveAddressInput,
  searchUrl,
} from './url';
import { stepZoom } from './zoom';
import type { SearchSettings } from '../../shared/search';

/** What a close took away, kept once undone so it can be redone. */
interface UndoneClose {
  kind: ClosedSummary['kind'];
  workspaceId: WorkspaceId;
  groupId: string | null;
  pageIds: PageId[];
}

interface Workspace {
  id: WorkspaceId;
  name: string;
  appearance: WorkspaceAppearance;
  tree: TrailTree;
  /** Named sets of top-level pages, in the order they show. */
  groups: PageGroup[];
  createdAt: number;
}

/** What one window has open in a workspace. */
interface WorkspaceView {
  activePageId: PageId | null;
  /** Two pages shown side by side whenever either one is active. */
  split: SplitView | null;
}

interface Page {
  workspaceId: WorkspaceId;
  /** `null` while the page has no live view: never loaded, or discarded. */
  host: PageHost | null;
  /** The window its view belongs to; a view can only be in one. */
  holder: BrowserController | null;
  state: PageRuntimeState;
  /** Saved back/forward list of a discarded page. */
  history: PageHistory | null;
  createdAt: number;
  lastActiveAt: number;
  /** Where "forward" leads once this page's own history runs out. */
  lastVisitedChildId: PageId | null;
  /** What was on screen when this page opened over it, to go back to. */
  openedOver: PageId | null;
  /** An empty page given an address: a download leaves it empty again. */
  startedBlank: boolean;
  /** A name the user gave the page, shown instead of its title. */
  customTitle: string | null;
  note: string | null;
  /** Kept at the top of the trail; closing puts it to sleep instead. */
  pinned: boolean;
  /** The group a top-level page is filed under; never set on a pinned page. */
  groupId: string | null;
  /** The mark a top-level trail was given. */
  emoji: string | null;
  /** The last address the page actually committed, as opposed to requested. */
  committedUrl: string | null;
  /** Permission requests waiting for the user, oldest first. */
  permissionQueue: PendingPermission[];
  /** Permissions refused on the current site. */
  blocked: Set<SitePermission>;
  /** Those of them the site was allowed, and macOS refused to Splash. */
  systemRefused: Set<SystemPermission>;
  /** Addresses stopped from opening in the current document. */
  blockedPopups: string[];
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
  /** The trails this window shares with others; by default its own. */
  trails?: SharedTrails;
  /** Where this window's page views go, for a host moving here. */
  site?: unknown;
  /** Brings this window to the front, for a page sent to it. */
  focusWindow?(): void;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** A page in this workspace committed a navigation to a new document. */
  onVisit?(url: string, workspaceId: WorkspaceId): void;
  /** A page reported the title of the document it shows. */
  onTitle?(url: string, title: string, workspaceId: WorkspaceId): void;
  /** A page reported the favicon of the document it shows. */
  onFavicon?(url: string, faviconUrl: string, workspaceId: WorkspaceId): void;
  /**
   * The profile (cookies, storage) a workspace's pages browse in. A page
   * moved to a workspace with another profile is opened again there.
   */
  profileOf?(workspaceId: WorkspaceId): string;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => string;
  now?: () => number;
  /** Live views kept before the least recently used are discarded. */
  maxLiveViews?: number;
  /** What resetting a page's zoom goes back to, in percent. */
  defaultZoom?: () => number;
  /** Where typed searches go. */
  search?: () => SearchSettings;
  /** The user chose to use this site's plain HTTP address from now on. */
  allowPlainHttp?(url: string): void;
  /** The user chose to visit a site reported as dangerous. */
  allowDangerousSite?(url: string): void;
  /** The user chose to use this site despite the certificate it showed. */
  allowCertificate?(url: string): void;
  /** What a page opened with no address loads, if anything. */
  newPageUrl?: () => string | null;
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
  /** File the new top-level page under this group. */
  groupId?: string;
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
const MAX_BLOCKED_POPUPS = 20;
const DEFAULT_WORKSPACE_NAME = 'Personal';
/** A restart isn't coming back; being away this long is. */
const COME_BACK_AFTER_MS = 60 * 60 * 1000;

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
 * What every window shares: the workspaces and their pages, each page's live
 * state, and what can be reopened. Each window's `BrowserController` keeps its
 * own view of them.
 */
export class SharedTrails {
  readonly workspaces = new Map<WorkspaceId, Workspace>();
  workspaceOrder: WorkspaceId[] = [];
  readonly pages = new Map<PageId, Page>();
  readonly closingIds = new Set<PageId>();
  closed: ClosedRecord[] = [];
  closedSerial = 0;
  maxLiveViews = DEFAULT_MAX_LIVE_VIEWS;
  /** Lowers `maxLiveViews` until it passes. */
  memoryPressure: MemoryPressure = 'normal';
  /** Whether the saved session has been read; only the first window does. */
  loaded = false;
  /** When the session being restored was saved, until the shell has said so. */
  leftAt: number | null = null;
  readonly viewers = new Set<BrowserController>();
  /**
   * The window saved as where you were: the last one focused, and the last
   * one open once they have all closed.
   */
  lead: BrowserController | null = null;
}

let nextViewerId = 1;

/**
 * One window's view of the trails: which page it has open in each workspace,
 * its split views, what it has collapsed, and which pages' Chromium views are
 * on screen here. Electron-specific work is delegated to `PageHost`s so this
 * class can be tested in plain Node.
 *
 * A view can only be in one window. A page opened in a second window moves
 * there, and the first shows that it's elsewhere until it moves back.
 */
export class BrowserController {
  private readonly trails: SharedTrails;
  readonly viewerId = String(nextViewerId++);
  private activeWorkspaceId: WorkspaceId;
  private readonly views = new Map<WorkspaceId, WorkspaceView>();
  private readonly collapsedIds = new Set<PageId>();
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

  private readonly schedule: (flush: () => void) => void;
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(private readonly options: BrowserControllerOptions) {
    this.schedule = options.schedule ?? queueMicrotask;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? Date.now;
    this.trails = options.trails ?? new SharedTrails();
    if (options.maxLiveViews !== undefined) {
      this.trails.maxLiveViews = Math.max(1, options.maxLiveViews);
    }
    // A new window starts from where the last one is.
    const from = this.trails.lead;
    if (from) {
      this.activeWorkspaceId = from.activeWorkspaceId;
      for (const [id, view] of from.views) this.views.set(id, { ...view });
      for (const id of from.collapsedIds) this.collapsedIds.add(id);
    } else {
      this.activeWorkspaceId = this.addWorkspace(DEFAULT_WORKSPACE_NAME).id;
    }
    this.trails.viewers.add(this);
    this.trails.lead = this;
  }

  private get workspaces() {
    return this.trails.workspaces;
  }
  private get workspaceOrder() {
    return this.trails.workspaceOrder;
  }
  private set workspaceOrder(order: WorkspaceId[]) {
    this.trails.workspaceOrder = order;
  }
  private get pages() {
    return this.trails.pages;
  }
  private get closingIds() {
    return this.trails.closingIds;
  }
  private readonly undoneCloses = new Map<number, UndoneClose>();
  private redoingClose = false;
  /** Closing a page that a download left empty; the shell words it so. */
  private closingForDownload = false;

  private get closed() {
    return this.trails.closed;
  }
  private set closed(records: ClosedRecord[]) {
    this.trails.closed = records;
  }
  private get closedSerial() {
    return this.trails.closedSerial;
  }
  private set closedSerial(serial: number) {
    this.trails.closedSerial = serial;
  }
  private get maxLiveViews() {
    return this.trails.maxLiveViews;
  }
  private set maxLiveViews(count: number) {
    this.trails.maxLiveViews = count;
  }

  get activePageId(): PageId | null {
    return this.viewOf(this.workspace).activePageId;
  }

  hasPage(id: PageId): boolean {
    return this.pages.has(id);
  }

  /** Whether this page's live view belongs to this window. */
  holds(id: PageId): boolean {
    const page = this.pages.get(id);
    return page?.host != null && page.holder === this;
  }

  /** The window saved as where you were. */
  becomeLead(): void {
    this.trails.lead = this;
  }

  /**
   * How a window starts: one opened beside others gets an empty page of its
   * own, and the first after all were closed goes back to where they were.
   */
  startWindow(): void {
    if (this.trails.viewers.size > 1) this.startWithNewPage();
    else this.switchWorkspace(this.activeWorkspaceId);
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
    const created = this.newPage(workspace.id);
    if (
      options.groupId !== undefined &&
      parentId === null &&
      workspace.groups.some((group) => group.id === options.groupId)
    ) {
      created.groupId = options.groupId;
    }
    this.pages.set(id, created);
    this.settleRoots(workspace);

    const url =
      options.url !== undefined
        ? options.url
        : options.input !== undefined
          ? this.resolve(options.input)
          : (this.options.newPageUrl?.() ?? null);
    if (url !== null) {
      this.load(id, url, {
        referrer: options.referrer,
        plainAddress:
          options.url === undefined && options.input !== undefined
            ? typedPlainAddress(options.input, url)
            : null,
      });
    }

    // Pages opened from either side of a split view open on its right, so
    // the left keeps its place while you follow links.
    const split = this.visibleSplit(workspace);
    if (activate && split && parentId !== null && inSplit(split, parentId)) {
      this.viewOf(workspace).split = { leftId: split.leftId, rightId: id };
    }

    if (activate || this.viewOf(workspace).activePageId === null) {
      created.openedOver = this.viewOf(workspace).activePageId;
      this.activatePage(id);
    } else {
      this.enforceLiveBudget();
      this.changed();
    }
    return id;
  }

  /**
   * Startup set to "a new page": the restored trails stay, and an empty
   * page opens on top. An empty page left from last time is reused, so
   * starting Splash never piles them up.
   */
  startWithNewPage(): PageId {
    const { tree } = this.workspace;
    const empty = tree.order().find((id) => {
      const node = tree.get(id);
      const page = this.pages.get(id);
      return (
        node?.parentId === null &&
        node.childIds.length === 0 &&
        page?.state.url === null &&
        // An outline's named line isn't an empty page.
        page.customTitle === null &&
        !page.history?.entries.length &&
        !this.wantedByPeer(id)
      );
    });
    if (empty === undefined) return this.createPage();
    this.activatePage(empty);
    const url = this.options.newPageUrl?.();
    if (url) this.load(empty, url);
    return empty;
  }

  /**
   * Shows a page, switching to its workspace if needed. The page comes here
   * from any window showing it, unless `steal` says the user didn't ask for
   * this page in particular: then that window keeps it.
   */
  activatePage(id: PageId, { steal = true }: { steal?: boolean } = {}): void {
    const page = this.require(id);
    const workspace = this.requireWorkspace(page.workspaceId);
    this.activeWorkspaceId = workspace.id;
    this.viewOf(workspace).activePageId = id;
    page.lastActiveAt = this.now();
    const parentId = workspace.tree.get(id)?.parentId ?? null;
    if (parentId !== null) this.require(parentId).lastVisitedChildId = id;
    this.reveal(workspace, id);
    this.ensureLive(id);
    this.claim(id, steal);
    const split = this.visibleSplit(workspace);
    if (split) {
      const partner = split.leftId === id ? split.rightId : split.leftId;
      this.ensureLive(partner);
      this.claim(partner, steal);
    }
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
      this.viewOf(workspace).activePageId === id &&
      workspace.tree.successorOf(id) === null
    )
      return this.keepPinned(id);
    return this.guardRemoval([id], () => this.closePageNow(id, unpin));
  }

  private closePageNow(
    id: PageId,
    unpin: boolean,
    returnTo: PageId | null = null,
  ): void {
    if (this.require(id).pinned && !unpin) return this.keepPinned(id);
    const workspace = this.workspaceOf(id);
    const { tree } = workspace;
    this.remember(workspace, [id], [...(tree.get(id)?.childIds ?? [])]);
    const heir = tree.successorOf(id);
    const { activePageId } = this.viewOf(workspace);
    const successor =
      activePageId !== id
        ? activePageId
        : returnTo !== null && returnTo !== id && tree.has(returnTo)
          ? returnTo
          : heir;
    const groupId =
      tree.get(id)?.parentId === null ? this.require(id).groupId : null;
    const promoted = [...(tree.get(id)?.childIds ?? [])];
    tree.remove(id);
    // Pages that stepped up into the page's place stay in its group.
    if (groupId !== null) {
      for (const childId of promoted) this.require(childId).groupId = groupId;
    }
    this.release(id);
    this.afterRemoval(workspace, successor, heir);
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
    const active = this.viewOf(workspace).activePageId;
    const heir = tree.branchSuccessorOf(id);
    const successor =
      active !== null && branch.includes(active) ? heir : active;
    tree.removeBranch(id);
    for (const pageId of branch) this.release(pageId);
    this.afterRemoval(workspace, successor, heir);
  }

  /**
   * Closes every page in the workspace except this one, the pages it came
   * from, the pages it led to, and pinned pages (with the pages above
   * them, so they keep their place). One reopen brings them all back.
   */
  closeOtherPages(id: PageId): void | Promise<void> {
    if (!this.pages.has(id) || this.closingIds.has(id)) return;
    const workspace = this.workspaceOf(id);
    const { tree } = workspace;
    const keep = new Set(tree.branch(id));
    const keepWithAncestors = (pageId: PageId) => {
      for (
        let at: PageId | null = pageId;
        at !== null && !keep.has(at);
        at = tree.get(at)?.parentId ?? null
      )
        keep.add(at);
    };
    for (let at = tree.get(id)?.parentId ?? null; at !== null; ) {
      keep.add(at);
      at = tree.get(at)?.parentId ?? null;
    }
    for (const pageId of tree.order()) {
      if (this.require(pageId).pinned) keepWithAncestors(pageId);
    }
    // Whole branches only: a kept page's parent is always kept too.
    const closing = tree.order().filter((pageId) => !keep.has(pageId));
    if (closing.length === 0) return;
    return this.guardRemoval(closing, () =>
      this.closeBranchesNow(workspace, closing, id, id),
    );
  }

  /**
   * Closes the loose pages of the workspace on screen, like Arc's Clear:
   * pinned pages and pages in groups stay, with everything under them. One
   * reopen brings them all back.
   */
  clearLoosePages(): void | Promise<void> {
    const workspace = this.workspace;
    const { tree } = workspace;
    const loose = (pageId: PageId) => {
      const page = this.require(pageId);
      return !page.pinned && page.groupId === null;
    };
    const tops = tree.rootIds.filter(loose);
    const closing = tops.flatMap((pageId) => tree.branch(pageId));
    if (closing.length === 0) return;
    return this.guardRemoval(closing, () => {
      const active = this.viewOf(workspace).activePageId;
      const kept = tree.rootIds.find((pageId) => !loose(pageId)) ?? null;
      const successor =
        active !== null && closing.includes(active) ? kept : active;
      this.closeBranchesNow(workspace, closing, successor, null);
    });
  }

  /**
   * Closes every page after this one in the sidebar, except pinned pages. One
   * reopen brings them all back. If the page on screen goes, this one shows.
   */
  closePagesBelow(id: PageId): void | Promise<void> {
    if (!this.pages.has(id) || this.closingIds.has(id)) return;
    const workspace = this.workspaceOf(id);
    const closing = pagesBelow(this.trailShape(workspace), id);
    if (closing.length === 0) return;
    return this.guardRemoval(closing, () => {
      const active = this.viewOf(workspace).activePageId;
      const successor =
        active !== null && closing.includes(active) ? id : active;
      this.closeBranchesNow(workspace, closing, successor, id);
    });
  }

  private trailShape(workspace: Workspace): TrailShape {
    const { tree } = workspace;
    return {
      rootIds: tree.rootIds,
      pages: Object.fromEntries(
        tree.order().map((pageId) => [
          pageId,
          {
            parentId: tree.get(pageId)?.parentId ?? null,
            childIds: tree.get(pageId)?.childIds ?? [],
            isPinned: this.require(pageId).pinned,
          },
        ]),
      ),
    };
  }

  /** Removes whole branches: a kept page's parent must be kept too. */
  private closeBranchesNow(
    workspace: Workspace,
    closing: PageId[],
    successor: PageId | null,
    heir: PageId | null,
  ): void {
    const { tree } = workspace;
    const closed = new Set(closing);
    // Found before removing any: a removed page's children leave the tree too.
    const tops = closing.filter((pageId) => {
      const parentId = tree.get(pageId)?.parentId ?? null;
      return parentId === null || !closed.has(parentId);
    });
    const activeBefore = this.viewOf(workspace).activePageId;
    this.remember(workspace, closing, []);
    const record = this.closed.at(-1);
    if (record) record.activeBefore = activeBefore;
    for (const pageId of tops) tree.removeBranch(pageId);
    for (const pageId of closing) this.release(pageId);
    this.afterRemoval(workspace, successor, heir);
  }

  /**
   * Puts the most recently closed page, branch or workspace back where it
   * was. Returns the page that becomes active, if any. Undo also goes back to
   * the page that was on screen; picking an entry from a list shows that entry.
   */
  reopenClosed(
    serial?: number,
    { restoreActive = serial === undefined } = {},
  ): PageId | null {
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
    // Back before its pages, so they can file themselves in it.
    const deleted = record.group;
    if (deleted && !workspace.groups.some((g) => g.id === deleted.group.id)) {
      workspace.groups.splice(deleted.index, 0, { ...deleted.group });
    }
    for (const closed of record.pages) {
      const parentId =
        closed.parentId !== null && tree.has(closed.parentId)
          ? closed.parentId
          : null;
      tree.add(closed.id, parentId, closed.index);
      if (closed.collapsed) this.collapsedIds.add(closed.id);
      this.pages.set(closed.id, {
        ...this.newPage(workspace.id),
        customTitle: closed.customTitle,
        note: closed.note,
        pinned: closed.pinned ?? false,
        groupId:
          closed.groupId &&
          closed.parentId === null &&
          workspace.groups.some((group) => group.id === closed.groupId)
            ? closed.groupId
            : null,
        emoji: closed.emoji ?? null,
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
    if (deleted) this.settleRoots(workspace);
    const root = record.pages[0];
    // An empty group has no page to go back to; the current one stays.
    if (deleted && !root) {
      this.changed();
      return this.viewOf(workspace).activePageId;
    }
    if (root && !record.workspace) {
      // Children that were promoted when the page closed go back under it,
      // unless they have been moved somewhere else since.
      const rootParent = tree.get(root.id)?.parentId ?? null;
      for (const childId of record.promotedChildIds) {
        if (tree.get(childId)?.parentId === rootParent) {
          tree.move(childId, root.id, Number.MAX_SAFE_INTEGER);
        }
      }
      const before = restoreActive ? record.activeBefore : null;
      const shown = before && tree.has(before) ? before : root.id;
      this.activatePage(shown);
      return shown;
    }
    const remembered = record.workspace?.activePageId ?? null;
    const view = this.viewOf(workspace);
    view.activePageId =
      remembered !== null && tree.has(remembered)
        ? remembered
        : (tree.rootIds[0] ?? null);
    this.switchWorkspace(workspace.id);
    return view.activePageId;
  }

  /**
   * Undoes one particular close, and remembers what it closed so `closeAgain`
   * can redo it. False if it was already undone some other way.
   */
  undoClose(serial: number): boolean {
    const record = this.closed.find((item) => item.summary.serial === serial);
    if (!record) return false;
    this.undoneCloses.set(serial, {
      kind: record.summary.kind,
      workspaceId: record.workspaceId,
      groupId: record.group?.group.id ?? null,
      pageIds: record.pages.map((page) => page.id),
    });
    this.reopenClosed(serial, { restoreActive: true });
    return true;
  }

  /**
   * Redoes a close taken back by `undoClose`, asking each page first as any
   * close does. Returns the serial of the new close, for undoing it in turn,
   * or null if nothing closed: the pages have gone, or one chose to stay.
   */
  async closeAgain(serial: number): Promise<number | null> {
    const undone = this.undoneCloses.get(serial);
    const plan = undone && this.closeAgainPlan(undone);
    if (!plan) return null;
    let next: number | null = null;
    await this.guardRemoval(plan.closing, () => {
      // The shell confirms a redo itself, so it mustn't offer a new undo too.
      this.redoingClose = true;
      try {
        plan.commit();
      } finally {
        this.redoingClose = false;
      }
      next = this.closed.at(-1)?.summary.serial ?? null;
    });
    if (next !== null) this.undoneCloses.delete(serial);
    return next;
  }

  /** How to close again what was reopened, as it stands now. */
  private closeAgainPlan({
    kind,
    workspaceId,
    groupId,
    pageIds,
  }: UndoneClose): { closing: PageId[]; commit(): void } | null {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;
    const { tree } = workspace;
    if (kind === 'workspace') {
      if (this.workspaces.size === 1) return null;
      return {
        closing: tree.order(),
        commit: () => this.deleteWorkspaceNow(workspaceId),
      };
    }
    if (kind === 'group') {
      if (!groupId || !workspace.groups.some((g) => g.id === groupId))
        return null;
      return {
        closing: this.groupBranches(workspace, groupId).closing,
        commit: () => this.deleteGroupWithPagesNow(groupId),
      };
    }
    const present = pageIds.filter((id) => tree.has(id));
    if (present.length === 0) return null;
    const [only] = present;
    if (pageIds.length === 1 && only) {
      // Its children step up again, as they did the first time.
      return {
        closing: [only],
        commit: () => this.closePageNow(only, true),
      };
    }
    // Pages opened under them since go too: a kept page needs its parent.
    const tops = present.filter((id) => {
      const parentId = tree.get(id)?.parentId ?? null;
      return parentId === null || !present.includes(parentId);
    });
    const closing = tree
      .order()
      .filter((id) => tops.some((top) => tree.isWithin(id, top)));
    return {
      closing,
      commit: () => {
        const order = tree.order();
        const at = order.findIndex((id) => closing.includes(id));
        const stays = (id: PageId) => !closing.includes(id);
        // The page just after them, or else the nearest above.
        const heir =
          order.slice(at).find(stays) ??
          order.slice(0, at).findLast(stays) ??
          null;
        const active = this.viewOf(workspace).activePageId;
        const successor =
          active !== null && closing.includes(active) ? heir : active;
        this.closeBranchesNow(workspace, closing, successor, heir);
      },
    };
  }

  /** What can be reopened, most recently closed first. */
  recentlyClosed(): ClosedSummary[] {
    return this.closed.map((record) => record.summary).reverse();
  }

  /** Clearing history also forgets what could be reopened, and where it was. */
  forgetClosed(): void {
    if (this.closed.length === 0) return;
    this.closed = [];
    this.changed();
  }

  /**
   * Moves a page and its branch under `parentId`, right after the sibling
   * `afterId` (or first, when `afterId` is null), within its workspace.
   * At the top level, `groupId` says which group it lands in (`null` for
   * none); left out, its neighbours decide.
   */
  movePage(
    id: PageId,
    parentId: PageId | null,
    afterId: PageId | null,
    groupId?: string | null,
  ): void {
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
    if (parentId !== null) this.collapsedIds.delete(parentId);
    const page = this.require(id);
    if (parentId !== null) page.groupId = null;
    else if (!page.pinned && groupId !== undefined) {
      const { groups } = this.workspaceOf(id);
      const group =
        groupId === null ? undefined : groups.find((g) => g.id === groupId);
      if (groupId !== null && !group) {
        throw new Error(`Group ${groupId} is not in this workspace`);
      }
      page.groupId = groupId;
      if (group) group.collapsed = false;
    } else if (!page.pinned) {
      // Dropped between two pages of a group, or after its last one, it joins.
      const roots = tree.rootIds;
      const at = roots.indexOf(id);
      const before = roots[at - 1];
      const after = roots[at + 1];
      const beforeGroup = before ? this.require(before).groupId : null;
      const afterGroup = after ? this.require(after).groupId : null;
      page.groupId =
        beforeGroup !== null &&
        (after === undefined || beforeGroup === afterGroup)
          ? beforeGroup
          : null;
    }
    this.settleRoots(this.workspaceOf(id));
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
    if (pinned) page.groupId = null;
    const canReturn =
      origin !== undefined &&
      (origin.parentId === null ||
        (tree.has(origin.parentId) && !tree.isWithin(origin.parentId, id)));
    if (canReturn) tree.move(id, origin.parentId, origin.index);
    else if (pinned || node.parentId === null) {
      tree.move(id, null, pinnedRoots);
    }
    this.settleRoots(this.workspaceOf(id));
    if (origin === undefined) {
      this.options.onNotice?.({
        kind: 'pinned',
        pageId: id,
        label: nameOf(page.customTitle, page.state),
        pinned,
        origin: was,
        at: { parentId: node.parentId, index: tree.indexOf(id) },
      });
    }
    this.changed();
  }

  // ── Groups ─────────────────────────────────────────────────────────────

  /**
   * Starts a group in the active workspace, optionally filing a page and
   * its branch in it. Its pages stay ordinary pages, just kept together.
   */
  createGroup(name?: string, pageId?: PageId): string {
    const workspace = this.workspace;
    const id = this.createId();
    workspace.groups.push({
      id,
      name: cleanText(name ?? null)?.slice(0, 100) ?? 'New group',
      collapsed: false,
    });
    if (pageId !== undefined) this.setPageGroup(pageId, id);
    else this.changed();
    return id;
  }

  renameGroup(groupId: string, name: string): void {
    const { group } = this.requireGroup(groupId);
    const clean = cleanText(name)?.slice(0, 100);
    if (clean) group.name = clean;
    this.changed();
  }

  setGroupCollapsed(groupId: string, collapsed: boolean): void {
    this.requireGroup(groupId).group.collapsed = collapsed;
    this.changed();
  }

  /** Gives a group its own mark, or back to a folder with `null`. */
  setGroupIcon(groupId: string, icon: GroupIcon | null): void {
    const { group } = this.requireGroup(groupId);
    if (icon) group.icon = icon;
    else delete group.icon;
    this.changed();
  }

  /** Dissolves a group; its pages stay where they are, no longer filed. */
  deleteGroup(groupId: string): void {
    const { workspace } = this.requireGroup(groupId);
    workspace.groups = workspace.groups.filter((group) => group.id !== groupId);
    for (const id of workspace.tree.rootIds) {
      const page = this.require(id);
      if (page.groupId === groupId) page.groupId = null;
    }
    this.settleRoots(workspace);
    this.changed();
  }

  /**
   * Removes a group and closes every page in it, branches included. One
   * reopen brings back the group and its pages together.
   */
  deleteGroupWithPages(groupId: string): void | Promise<void> {
    const { workspace } = this.requireGroup(groupId);
    return this.guardRemoval(
      this.groupBranches(workspace, groupId).closing,
      () => this.deleteGroupWithPagesNow(groupId),
    );
  }

  private deleteGroupWithPagesNow(groupId: string): void {
    const { workspace, group } = this.requireGroup(groupId);
    const { tree } = workspace;
    const { tops, closing } = this.groupBranches(workspace, groupId);
    this.remember(workspace, closing, [], null, {
      group: { ...group },
      index: workspace.groups.indexOf(group),
    });
    // The page after the group takes over, or the one before it at the end.
    const roots = tree.rootIds;
    const after = roots.findIndex((id) => tops.includes(id));
    const others = roots.filter((id) => !tops.includes(id));
    const heir = others[after] ?? others.at(-1) ?? null;
    const active = this.viewOf(workspace).activePageId;
    const successor =
      active !== null && closing.includes(active) ? heir : active;
    for (const id of tops) tree.removeBranch(id);
    for (const id of closing) this.release(id);
    workspace.groups = workspace.groups.filter((item) => item !== group);
    this.settleRoots(workspace);
    this.afterRemoval(workspace, successor, heir);
  }

  /** A group's top-level pages, and those with everything beneath them. */
  private groupBranches(workspace: Workspace, groupId: string) {
    const { tree } = workspace;
    const tops = tree.rootIds.filter(
      (id) => this.require(id).groupId === groupId,
    );
    return { tops, closing: tops.flatMap((id) => tree.branch(id)) };
  }

  /**
   * Files a page (brought to the top level, with its branch) at the end of
   * a group, or takes it out of its group with `null`.
   */
  setPageGroup(id: PageId, groupId: string | null): void {
    const page = this.require(id);
    const workspace = this.workspaceOf(id);
    if (groupId !== null) {
      if (!workspace.groups.some((group) => group.id === groupId)) {
        throw new Error(`Group ${groupId} is not in this workspace`);
      }
      const node = workspace.tree.get(id)!;
      if (node.parentId !== null) {
        workspace.tree.move(id, null, workspace.tree.rootIds.length);
      }
      page.pinned = false;
      workspace.groups.find((group) => group.id === groupId)!.collapsed = false;
    }
    page.groupId = groupId;
    if (groupId !== null) {
      // At the end of the group.
      workspace.tree.move(id, null, workspace.tree.rootIds.length);
    }
    this.settleRoots(workspace);
    this.changed();
  }

  /**
   * Brings a saved group in as real pages of the active workspace. They
   * come without views and load when opened, like a restored session.
   */
  importGroup(
    name: string,
    collapsed: boolean,
    links: { url: string; title: string; faviconUrl?: string | null }[],
  ): string {
    const workspace = this.workspace;
    const groupId = this.createId();
    workspace.groups.push({
      id: groupId,
      name: cleanText(name)?.slice(0, 100) ?? 'Group',
      collapsed,
    });
    for (const link of links) {
      const id = this.createId();
      workspace.tree.add(id, null);
      this.pages.set(id, {
        ...this.newPage(workspace.id),
        state: {
          ...EMPTY_STATE,
          url: link.url,
          title: link.title,
          faviconUrl: link.faviconUrl ?? null,
        },
        committedUrl: link.url,
        groupId,
      });
    }
    this.settleRoots(workspace);
    this.changed();
    return groupId;
  }

  /**
   * Keeps the top level in the order the sidebar shows it: pinned pages,
   * then each group's pages in group order, then the rest. Pages keep
   * their order within each part.
   */
  private settleRoots(workspace: Workspace): void {
    const { tree } = workspace;
    const rank = (id: PageId): number => {
      const page = this.require(id);
      if (page.pinned) {
        page.groupId = null;
        return 0;
      }
      const index = workspace.groups.findIndex(
        (group) => group.id === page.groupId,
      );
      if (index === -1) {
        page.groupId = null;
        return workspace.groups.length + 1;
      }
      return index + 1;
    };
    const wanted = tree.rootIds
      .map((id, position) => ({ id, position, rank: rank(id) }))
      .sort((a, b) => a.rank - b.rank || a.position - b.position)
      .map((entry) => entry.id);
    wanted.forEach((id, index) => {
      if (tree.rootIds[index] !== id) tree.move(id, null, index);
    });
  }

  private requireGroup(groupId: string): {
    workspace: Workspace;
    group: PageGroup;
  } {
    for (const workspace of this.workspaces.values()) {
      const group = workspace.groups.find((item) => item.id === groupId);
      if (group) return { workspace, group };
    }
    throw new Error(`Group ${groupId} does not exist`);
  }

  /** Opens a child, optionally loading its destination before activation. */
  createChildPage(parentId: PageId, input?: string): PageId {
    this.require(parentId);
    return this.createPage({ parentId, input });
  }

  /** Opens a page right after this one, at the same level. */
  createSiblingPage(id: PageId, input?: string): PageId {
    const page = this.require(id);
    const { tree } = this.workspaceOf(id);
    return this.createPage({
      parentId: tree.get(id)?.parentId ?? null,
      index: tree.indexOf(id) + 1,
      input,
      ...(page.groupId ? { groupId: page.groupId } : {}),
    });
  }

  /**
   * Brings a Markdown outline in as pages. They come without views and load
   * when opened, like a restored session. Under a page they join its branch;
   * otherwise one list is a new trail, and several are a group of trails.
   */
  importOutline(
    outline: TrailOutline,
    { parentId = null, name }: { parentId?: PageId | null; name?: string } = {},
  ): {
    label: string;
    pageCount: number;
    pageIds: PageId[];
    groupId: string | null;
  } {
    const workspace =
      parentId === null ? this.workspace : this.workspaceOf(parentId);
    const { tree } = workspace;
    const { items, title } = outline;
    const groupName = title ?? name ?? 'Imported trail';
    let groupId: string | null = null;
    if (parentId === null && items.length > 1) {
      groupId = this.createId();
      workspace.groups.push({
        id: groupId,
        name: cleanText(groupName)?.slice(0, 100) ?? 'Imported trail',
        collapsed: false,
      });
    }
    const add = (item: OutlineItem, under: PageId | null): PageId => {
      const id = this.createId();
      tree.add(id, under);
      this.pages.set(id, {
        ...this.newPage(workspace.id),
        state: {
          ...EMPTY_STATE,
          url: item.url,
          title: item.url ? item.label : '',
        },
        committedUrl: item.url,
        // A line with no address has only this for a name.
        customTitle: item.url ? null : item.label,
        note: item.note,
        emoji: under === null ? item.emoji : null,
        groupId: under === null ? groupId : null,
      });
      for (const child of item.children) add(child, id);
      return id;
    };
    const pageIds = items.map((item) => add(item, parentId));
    const [only] = pageIds;
    // A heading over one list names that trail; its pages keep their titles.
    if (parentId === null && only !== undefined && !groupId && title) {
      this.require(only).customTitle = title;
    }
    if (parentId !== null) this.collapsedIds.delete(parentId);
    this.settleRoots(workspace);
    const view = this.viewOf(workspace);
    if (view.activePageId === null && only !== undefined) {
      this.activatePage(only);
    } else {
      this.changed();
    }
    return {
      label:
        groupId !== null
          ? groupName
          : only !== undefined
            ? nameOf(this.require(only).customTitle, this.require(only).state)
            : groupName,
      pageCount: outline.pageCount,
      pageIds,
      groupId,
    };
  }

  /** Takes back an import: one close, which reopening brings back whole. */
  undoImport(pageIds: PageId[], groupId: string | null): void | Promise<void> {
    if (groupId !== null) {
      const known = [...this.workspaces.values()].some((workspace) =>
        workspace.groups.some((group) => group.id === groupId),
      );
      return known ? this.deleteGroupWithPages(groupId) : undefined;
    }
    const here = pageIds.filter((id) => this.pages.has(id));
    const [first] = here;
    if (first === undefined) return;
    const workspace = this.workspaceOf(first);
    const closing = here.flatMap((id) => workspace.tree.branch(id));
    return this.guardRemoval(closing, () => {
      const active = this.viewOf(workspace).activePageId;
      const heir =
        workspace.tree.get(first)?.parentId ??
        workspace.tree.rootIds.find((id) => !here.includes(id)) ??
        null;
      const successor =
        active !== null && closing.includes(active) ? heir : active;
      this.closeBranchesNow(workspace, closing, successor, heir);
    });
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
      emoji: page.emoji,
      history: page.host?.captureHistory() ?? page.history,
      state: { ...page.state, isLoading: false, error: null },
    });
    this.activatePage(copyId);
    return copyId;
  }

  /**
   * Shows `id` beside `otherId` and makes it the active page. Without a
   * `side`, an ancestor goes on the left, so a parent and its child read in
   * trail order; a page dropped on one side goes there.
   */
  openSplit(id: PageId, otherId: PageId, side?: 'left' | 'right'): void {
    const workspace = this.workspaceOf(id);
    if (id === otherId || !workspace.tree.has(otherId)) {
      throw new Error('A split view needs two pages of one workspace');
    }
    const left = side ? side === 'left' : workspace.tree.isWithin(otherId, id);
    this.viewOf(workspace).split = left
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
    const { split } = this.viewOf(workspace);
    if (split && inSplit(split, id)) {
      this.closeSplit(workspace.id);
      return;
    }
    const related = this.relatedPageOf(id);
    if (related !== null) this.openSplit(id, related);
  }

  /** Ends a workspace's split view; its active page stays on screen. */
  closeSplit(workspaceId: WorkspaceId = this.activeWorkspaceId): void {
    const view = this.viewOf(this.requireWorkspace(workspaceId));
    if (!view.split) return;
    view.split = null;
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

  /** Gives a trail its mark; `null` goes back to its site's icon. */
  setEmoji(id: PageId, emoji: string | null): void {
    this.require(id).emoji = cleanText(emoji);
    this.changed();
  }

  /** Attaches a short note to a page; `null` removes it. */
  setNote(id: PageId, note: string | null): void {
    this.require(id).note = cleanText(note);
    this.changed();
  }

  navigate(id: PageId, input: string): void {
    const page = this.require(id);
    page.startedBlank =
      page.state.url === null && page.committedUrl === null && !page.history;
    // Typing an address here means here, whichever window has the page.
    if (id === this.activePageId) this.claim(id, true);
    const url = this.resolve(input);
    this.load(id, url, { plainAddress: typedPlainAddress(input, url) });
  }

  /**
   * HTTPS failed and the user read why: use the site's plain address, now and
   * next time. Only the shell can ask, and only from that warning.
   */
  continueOverHttp(id: PageId): void {
    const { error } = this.require(id).state;
    if (error?.kind !== 'no-secure-connection') return;
    this.options.allowPlainHttp?.(error.url);
    this.load(id, error.url);
  }

  /**
   * The user read the warning and wants the site anyway, now and next time.
   * Only the shell can ask, and only from that warning.
   */
  continuePastCertificate(id: PageId): void {
    const { error } = this.require(id).state;
    if (!error || !canContinuePastCertificate(error.code)) return;
    if (error.certificateLocked) return;
    // After a failed upgrade the warning holds the plain address.
    const address =
      error.kind === 'no-secure-connection'
        ? secureUpgradeOf(error.url)
        : error.kind === 'load-failed'
          ? error.url
          : null;
    if (!address) return;
    this.options.allowCertificate?.(address);
    this.load(id, address);
  }

  /**
   * The user read the warning and wants the site anyway, now and next time.
   * Only the shell can ask, and only from that warning.
   */
  continueToDangerousSite(id: PageId): void {
    const { error } = this.require(id).state;
    if (error?.kind !== 'dangerous-site') return;
    this.options.allowDangerousSite?.(error.url);
    this.load(id, error.url);
  }

  /** Changes how many pages stay awake, putting extra ones to sleep now. */
  setMaxLiveViews(count: number): void {
    this.maxLiveViews = Math.max(1, Math.trunc(count));
    this.enforceLiveBudget();
  }

  /** The Mac has more or less memory to spare: applies at once if it's less. */
  setMemoryPressure(pressure: MemoryPressure): void {
    this.trails.memoryPressure = pressure;
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

  /** What macOS refused to Splash on this page, since it last loaded. */
  systemRefusedOn(id: PageId): SystemPermission[] {
    return [...(this.pages.get(id)?.systemRefused ?? [])];
  }

  reload(id: PageId, options: { ignoreCache?: boolean } = {}): void {
    const page = this.require(id);
    // The way to find out if a change in System Settings took.
    if (page.systemRefused.size > 0) {
      for (const permission of page.systemRefused) {
        page.blocked.delete(permission);
      }
      page.systemRefused.clear();
      this.changed();
    }
    // A crash leaves the history intact, so reloading adds nothing to it and
    // keeps the back button honest.
    if (page.state.error?.kind === 'crashed' && page.host) {
      page.state = { ...page.state, error: null, isLoading: true };
      page.host.reload(options);
      this.syncVisibleHost();
      this.changed();
      return;
    }
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

  /**
   * Shows the top of the trail `offset` above or below this one, wrapping
   * around. Trails inside a folded group are skipped, as they aren't shown.
   */
  activateAdjacentTrail(offset: 1 | -1): void {
    const workspace = this.workspace;
    const { tree, groups } = workspace;
    const folded = new Set(
      groups.filter((group) => group.collapsed).map((group) => group.id),
    );
    const trails = tree.rootIds.filter((id) => {
      const groupId = this.require(id).groupId;
      return groupId === null || !folded.has(groupId);
    });
    if (trails.length === 0) return;
    const current = this.activePageId;
    const index =
      current === null ? -1 : trails.indexOf(this.trailOf(workspace, current));
    const start = index === -1 ? (offset > 0 ? -1 : 0) : index;
    const next = trails[(start + offset + trails.length) % trails.length]!;
    if (next !== current) this.activatePage(next);
  }

  /**
   * One step at a time, on the way down to the page on screen. The page stays
   * on screen whichever way it goes: collapsing folds the lowest open level,
   * expanding unfolds the highest closed one.
   */
  stepCollapse(direction: 'collapse' | 'expand'): void {
    const id = this.activePageId;
    if (id === null) return;
    const { tree } = this.workspaceOf(id);
    const path: PageId[] = [];
    for (let at: PageId | null = id; at !== null; ) {
      path.unshift(at);
      at = tree.get(at)?.parentId ?? null;
    }
    const canFold = (pageId: PageId) =>
      (tree.get(pageId)?.childIds.length ?? 0) > 0;
    if (direction === 'expand') {
      const fold = path.find(
        (pageId) => this.collapsedIds.has(pageId) && canFold(pageId),
      );
      if (fold !== undefined) this.setCollapsed(fold, false);
      return;
    }
    const fold = path.findLast(
      (pageId) => !this.collapsedIds.has(pageId) && canFold(pageId),
    );
    if (fold !== undefined) this.setCollapsed(fold, true);
  }

  /**
   * Collapses every trail and group but the one this page is in, and shows
   * the way down to it. The shell says what changed and offers to undo it.
   */
  collapseOtherTrails(id: PageId | null = this.activePageId): void {
    if (id === null) return;
    const workspace = this.workspaceOf(id);
    const { tree, groups } = workspace;
    const keep = this.trailOf(workspace, id);
    const keepGroup = this.require(keep).groupId;
    const pageIds = tree.rootIds.filter(
      (root) =>
        root !== keep &&
        (tree.get(root)?.childIds.length ?? 0) > 0 &&
        !this.collapsedIds.has(root),
    );
    const groupIds = groups
      .filter((group) => group.id !== keepGroup && !group.collapsed)
      .map((group) => group.id);
    this.reveal(workspace, id);
    this.setTrailsCollapsed(pageIds, groupIds, true);
    this.options.onNotice?.({ kind: 'trails-collapsed', pageIds, groupIds });
  }

  /** Folds or unfolds these together; any that have since gone are skipped. */
  setTrailsCollapsed(
    pageIds: readonly PageId[],
    groupIds: readonly string[],
    collapsed: boolean,
  ): void {
    for (const id of pageIds) {
      if (!this.pages.has(id)) continue;
      if (collapsed) this.collapsedIds.add(id);
      else this.collapsedIds.delete(id);
    }
    for (const workspace of this.workspaces.values()) {
      for (const group of workspace.groups) {
        if (groupIds.includes(group.id)) group.collapsed = collapsed;
      }
    }
    this.changed();
  }

  /** The top-level page of the trail a page is in. */
  private trailOf(workspace: Workspace, id: PageId): PageId {
    let at = id;
    for (
      let parent = workspace.tree.get(at)?.parentId ?? null;
      parent !== null;
      parent = workspace.tree.get(at)?.parentId ?? null
    ) {
      at = parent;
    }
    return at;
  }

  stop(id: PageId): void {
    this.require(id).host?.stop();
  }

  /** Opens a web page's source as its child; null if it has none to show. */
  viewSource(id: PageId): PageId | null {
    const { url } = this.require(id).state;
    if (!url || !isNavigableUrl(url)) return null;
    return this.createPage({ parentId: id, url: `view-source:${url}` });
  }

  toggleDevTools(id: PageId): void {
    this.require(id).host?.toggleDevTools();
  }

  setCollapsed(id: PageId, collapsed: boolean): void {
    this.require(id);
    if (collapsed) this.collapsedIds.add(id);
    else this.collapsedIds.delete(id);
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

  /**
   * Frees a page's view so it wakes again in another profile. Unlike
   * `discard`, it can't wait for unsaved form edits: the page has to go.
   */
  private reopenInProfile(id: PageId): void {
    const page = this.require(id);
    if (!page.host) return;
    page.history = page.host.captureHistory() ?? page.history;
    this.cancelPermissionRequests(page);
    page.host.destroy();
    page.host = null;
    this.forgetView(id);
    page.state = {
      ...page.state,
      isLoading: false,
      isAudible: false,
      isUnresponsive: false,
      hasFormEdits: false,
      find: null,
    };
  }

  /** Frees a page's view, keeping its address and history for later. */
  discard(id: PageId): void {
    const page = this.require(id);
    if (!page.host || page.state.hasFormEdits) return;
    page.history = page.host.captureHistory() ?? page.history;
    this.cancelPermissionRequests(page);
    page.host.destroy();
    page.host = null;
    this.forgetView(id);
    page.state = {
      ...page.state,
      isLoading: false,
      isAudible: false,
      isUnresponsive: false,
      find: null,
    };
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
      direction === 'reset'
        ? (this.options.defaultZoom?.() ?? 100)
        : stepZoom(page.state.zoomPercent, direction);
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

  /** Zoom settings changed: every awake page takes up what now applies. */
  applyZoomSettings(): void {
    for (const page of this.pages.values()) page.host?.applySiteZoom();
  }

  /**
   * Fonts and encodings are fixed when a view is created, so settings for
   * them need new views. Pages on screen come straight back; the others wake
   * into the new settings. A page someone is typing in or listening to keeps
   * its view rather than lose anything.
   */
  rebuildViews(): void {
    for (const [id, page] of this.pages) {
      if (!this.holds(id) || !page.host || page.state.error) continue;
      if (page.host.isAudible() || page.host.isInUse?.()) continue;
      const onScreen = this.visibleIds.has(id) || id === this.activePageId;
      this.discard(id);
      if (onScreen) this.ensureLive(id);
    }
    this.syncVisibleHost();
    this.changed();
  }

  /** Opens a popup the page was stopped from opening, as its child. */
  openBlockedPopup(id: PageId, url: string): void {
    const page = this.require(id);
    if (!page.blockedPopups.includes(url)) return;
    page.blockedPopups = page.blockedPopups.filter((other) => other !== url);
    if (page.blockedPopups.length === 0) page.blocked.delete('popups');
    this.createPage({ url, parentId: id });
  }

  /** A site's popups were allowed: its pages stop saying they're blocked. */
  clearBlockedPopups(origin: string): void {
    for (const page of this.pages.values()) {
      if (page.state.url && originOf(page.state.url) === origin) {
        page.blocked.delete('popups');
      }
    }
    this.changed();
  }

  /** Pages in this window with a live view, and how many are asleep. */
  taskPages(): {
    live: {
      id: PageId;
      title: string;
      url: string | null;
      faviconUrl: string | null;
      isUnresponsive: boolean;
    }[];
    asleep: number;
  } {
    const live = [];
    let asleep = 0;
    for (const [id, page] of this.pages) {
      if (page.host) {
        if (!this.holds(id)) continue;
        live.push({
          id,
          title: nameOf(page.customTitle, page.state),
          url: page.state.url,
          faviconUrl: page.state.faviconUrl,
          isUnresponsive: page.state.isUnresponsive,
        });
      } else if (page.state.url !== null) asleep += 1;
    }
    return { live, asleep };
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
    const view = this.viewOf(workspace);
    view.activePageId ??= workspace.tree.rootIds[0] ?? null;
    if (view.activePageId !== null) {
      this.activatePage(view.activePageId, { steal: false });
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
      activePageId: this.viewOf(workspace).activePageId,
      index,
    });
    for (const pageId of pageIds) this.release(pageId);
    this.workspaces.delete(id);
    this.workspaceOrder = this.workspaceOrder.filter((other) => other !== id);
    const next =
      this.workspaceOrder[Math.min(index, this.workspaceOrder.length - 1)]!;
    // Every window leaves it first, so none is ever asked to show it.
    const leaving = [...this.trails.viewers].filter((viewer) => {
      viewer.views.delete(id);
      if (viewer.activeWorkspaceId !== id) return false;
      viewer.activeWorkspaceId = next;
      return true;
    });
    for (const viewer of leaving) viewer.switchWorkspace(next);
    if (leaving.length === 0) this.changed();
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
      wasActive: this.viewOf(source).activePageId === id,
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
      index: target.tree.indexOf(id),
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
    else this.viewOf(target).activePageId = id;
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
      return { pageId, parentId: node.parentId };
    });
    const active = this.viewOf(source).activePageId;
    const heir = source.tree.branchSuccessorOf(id);
    const successor =
      active !== null && branch.includes(active) ? heir : active;
    for (const viewer of this.trails.viewers) {
      const view = viewer.views.get(source.id);
      if (
        view?.split &&
        branch.some((pageId) => inSplit(view.split!, pageId))
      ) {
        view.split = null;
      }
    }
    source.tree.removeBranch(id);
    const profileOf = this.options.profileOf;
    const reopens =
      profileOf !== undefined && profileOf(source.id) !== profileOf(target.id);
    for (const node of structure) {
      const isRoot = node.pageId === id;
      target.tree.add(
        node.pageId,
        isRoot ? parentId : node.parentId,
        isRoot ? index : undefined,
      );
      this.require(node.pageId).workspaceId = target.id;
      this.require(node.pageId).groupId = null;
      // A view can't change its session, so the page is opened again at the
      // same place in its new workspace's profile, signed in as that one is.
      if (reopens) this.reopenInProfile(node.pageId);
    }
    const targetView = this.viewOf(target);
    targetView.activePageId ??= id;
    this.settleRoots(target);
    this.afterRemoval(source, successor, heir);
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
          groupId: page.groupId,
          ...(page.emoji ? { emoji: page.emoji } : {}),
          collapsed: this.collapsedIds.has(id),
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
          activePageId: this.viewOf(workspace).activePageId,
          split: this.viewOf(workspace).split,
          groups: workspace.groups.map((group) => ({ ...group })),
          createdAt: workspace.createdAt,
        };
      }),
      pages,
      activeWorkspaceId: this.activeWorkspaceId,
      closed: [...this.closed],
      savedAt: this.now(),
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
    this.views.clear();
    this.collapsedIds.clear();
    this.trails.leftAt = session.savedAt ?? null;

    for (const stored of session.workspaces) {
      const workspace = this.addWorkspace(stored.name, stored.id);
      workspace.createdAt = stored.createdAt;
      workspace.appearance = stored.appearance ?? DEFAULT_APPEARANCE;
      workspace.groups = (stored.groups ?? []).map((group) => ({ ...group }));
    }
    for (const stored of session.pages) {
      const workspace = this.workspaces.get(stored.workspaceId);
      if (!workspace || this.pages.has(stored.id)) continue;
      const parentId =
        stored.parentId !== null && workspace.tree.has(stored.parentId)
          ? stored.parentId
          : null;
      workspace.tree.add(stored.id, parentId);
      if (stored.collapsed) this.collapsedIds.add(stored.id);
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
        groupId:
          parentId === null &&
          !stored.pinned &&
          workspace.groups.some((group) => group.id === stored.groupId)
            ? (stored.groupId ?? null)
            : null,
        emoji: stored.emoji ?? null,
        createdAt: stored.createdAt,
        lastActiveAt: stored.lastActiveAt,
      });
    }
    for (const workspace of this.workspaces.values())
      this.settleRoots(workspace);
    for (const stored of session.workspaces) {
      const workspace = this.workspaces.get(stored.id)!;
      const split = stored.split ?? null;
      this.views.set(stored.id, {
        activePageId:
          stored.activePageId !== null &&
          workspace.tree.has(stored.activePageId)
            ? stored.activePageId
            : (workspace.tree.rootIds[0] ?? null),
        split:
          split &&
          split.leftId !== split.rightId &&
          workspace.tree.has(split.leftId) &&
          workspace.tree.has(split.rightId)
            ? split
            : null,
      });
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
        collapsed: this.collapsedIds.has(id),
        ...page.state,
        ...this.trailNavigation(id),
        isDiscarded: page.host === null && page.state.url !== null,
        shownElsewhere: this.shownElsewhere(id),
        customTitle: page.customTitle,
        note: page.note,
        isPinned: page.pinned,
        groupId: page.groupId,
        emoji: page.emoji,
        lastActiveAt: page.lastActiveAt,
        blockedPermissions: [...page.blocked],
        blockedPopups: [...page.blockedPopups],
        permissionRequest: page.permissionQueue[0]?.request ?? null,
      };
    }
    const { activePageId, split } = this.viewOf(workspace);
    return {
      pages,
      rootIds: [...workspace.tree.rootIds],
      groups: workspace.groups.map((group) => ({ ...group })),
      activePageId,
      split: split && { ...split },
      otherWindows: [...this.trails.viewers]
        .filter((viewer) => viewer !== this)
        .map((viewer) => ({ id: viewer.viewerId, title: viewer.title() })),
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
      ...(this.options.profileOf
        ? { activeProfile: this.options.profileOf(workspace.id) }
        : {}),
    };
  }

  /**
   * What to say about coming back, once, if Splash reopened after a while with
   * more than the trail on screen to go back to. Names the one used before it.
   */
  takeComeBack(): Extract<Notice, { kind: 'come-back' }> | null {
    const leftAt = this.trails.leftAt;
    this.trails.leftAt = null;
    if (leftAt === null || this.now() - leftAt < COME_BACK_AFTER_MS)
      return null;
    const snapshot = this.snapshot();
    const summaries = trailSummaries(snapshot);
    const previous = summaries.find((summary) => !summary.current);
    if (!previous || summaries.length < 2) return null;
    const name = (id: PageId) => {
      const page = this.require(id);
      return nameOf(page.customTitle, page.state);
    };
    return {
      kind: 'come-back',
      trailCount: summaries.length,
      trail: name(previous.rootId),
      page: name(previous.leftId),
    };
  }

  /** Also used before closing a window or quitting; leaves trail records intact. */
  async prepareWindowClose(): Promise<boolean> {
    return this.prepareClose(
      [...this.pages.keys()].filter((id) => this.holds(id)),
    );
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
          this.forgetView(id);
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
        if (active && this.pages.has(active)) {
          this.activatePage(active, { steal: false });
        }
        this.syncVisibleHost();
      }
      this.changed();
    }
  }

  /**
   * The window has closed. Its pages stay in the trails, asleep, and any that
   * another window has open wake up there.
   */
  dispose(): void {
    this.disposed = true;
    const { trails } = this;
    trails.viewers.delete(this);
    for (const page of this.pages.values()) {
      if (page.holder !== this || !page.host) continue;
      try {
        page.history = page.host.captureHistory() ?? page.history;
      } catch {
        // The window took the contents with it; the last save has the history.
      }
      this.cancelPermissionRequests(page);
      page.host.destroy();
      page.host = null;
      page.state = {
        ...page.state,
        isLoading: false,
        isAudible: false,
        isUnresponsive: false,
        find: null,
      };
    }
    this.visibleIds.clear();
    if (trails.lead === this) {
      trails.lead = trails.viewers.values().next().value ?? this;
    }
    for (const viewer of trails.viewers) viewer.wakeWanted();
  }

  // ── Windows ────────────────────────────────────────────────────────────

  /**
   * Hands a page to another window and brings that window forward. This one
   * goes on to the next page.
   */
  moveToWindow(id: PageId, viewerId: string): void {
    const viewer = [...this.trails.viewers].find(
      (other) => other.viewerId === viewerId,
    );
    if (!viewer || viewer === this) return;
    this.stepAwayFrom(id);
    viewer.activatePage(id);
    viewer.options.focusWindow?.();
  }

  /** Stops showing a page that's leaving for another window. */
  stepAwayFrom(id: PageId): void {
    const workspace = this.workspaceOf(id);
    const view = this.viewOf(workspace);
    if (view.split && inSplit(view.split, id)) view.split = null;
    if (view.activePageId !== id) return this.changed();
    const next =
      workspace.tree.branchSuccessorOf(id) ?? workspace.tree.successorOf(id);
    if (next !== null) this.activatePage(next, { steal: false });
    else this.createPage();
  }

  /** What this window is showing, to tell it from the others. */
  private title(): string {
    const id = this.activePageId;
    const page = id === null ? undefined : this.pages.get(id);
    return page ? nameOf(page.customTitle, page.state) : 'New page';
  }

  /** The pages this window means to show, whichever window has them now. */
  private wantedIds(): PageId[] {
    const workspace = this.workspaces.get(this.activeWorkspaceId);
    if (!workspace) return [];
    const { activePageId } = this.viewOf(workspace);
    if (activePageId === null) return [];
    const split = this.visibleSplit(workspace);
    return split ? [split.leftId, split.rightId] : [activePageId];
  }

  private wantedByPeer(id: PageId): boolean {
    return [...this.trails.viewers].some(
      (viewer) => viewer !== this && viewer.wantedIds().includes(id),
    );
  }

  /** Whether another window is showing this page, so this one can't. */
  private shownElsewhere(id: PageId): boolean {
    const page = this.pages.get(id);
    return (
      page?.host != null &&
      page.holder !== this &&
      page.holder?.wantedIds().includes(id) === true
    );
  }

  /**
   * Moves a page's view here. Without `steal` it stays with a window that
   * still wants it.
   */
  private claim(id: PageId, steal: boolean): void {
    const page = this.require(id);
    const holder = page.holder;
    if (!page.host || holder === this) return;
    if (!steal && holder?.wantedIds().includes(id)) return;
    if (holder?.visibleIds.delete(id)) page.host.hide();
    if (holder?.fullscreenId === id) holder.fullscreenId = null;
    page.holder = this;
    if (this.options.site !== undefined) page.host.moveTo(this.options.site);
  }

  /** Takes back what another window has stopped showing. */
  private settle(): void {
    if (this.trails.viewers.size < 2) return;
    const workspace = this.workspace;
    const view = this.viewOf(workspace);
    const first = workspace.tree.rootIds[0];
    if (view.activePageId === null && first !== undefined) {
      return this.activatePage(first, { steal: false });
    }
    let moved = false;
    for (const id of this.wantedIds()) {
      if (this.pages.has(id) && !this.holds(id) && !this.shownElsewhere(id)) {
        const before = this.pages.get(id)?.holder;
        this.claim(id, false);
        moved ||= this.pages.get(id)?.holder !== before;
      }
    }
    if (!moved) return;
    this.syncVisibleHost();
    this.changed();
  }

  /** A window closed: wakes what this one had open and it was showing. */
  private wakeWanted(): void {
    for (const id of this.wantedIds()) {
      if (!this.pages.has(id)) continue;
      this.ensureLive(id);
      this.claim(id, false);
    }
    this.syncVisibleHost();
    this.changed();
  }

  /** Forgets that a view is on screen anywhere, as it's about to be gone. */
  private forgetView(id: PageId): void {
    for (const viewer of this.trails.viewers) {
      viewer.visibleIds.delete(id);
      if (viewer.fullscreenId === id) viewer.fullscreenId = null;
    }
  }

  /** Expands every page above this one, in this window. */
  private reveal(workspace: Workspace, id: PageId): void {
    let parentId = workspace.tree.get(id)?.parentId ?? null;
    while (parentId !== null) {
      this.collapsedIds.delete(parentId);
      parentId = workspace.tree.get(parentId)?.parentId ?? null;
    }
  }

  /** What this window has open in a workspace; at first, its first page. */
  private viewOf(workspace: Workspace): WorkspaceView {
    let view = this.views.get(workspace.id);
    if (!view) {
      view = { activePageId: workspace.tree.rootIds[0] ?? null, split: null };
      this.views.set(workspace.id, view);
    }
    return view;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private resolve(input: string): string {
    return resolveAddressInput(input, this.options.search?.());
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
      groups: [],
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
      holder: null,
      state: { ...EMPTY_STATE },
      history: null,
      createdAt: now,
      lastActiveAt: now,
      lastVisitedChildId: null,
      openedOver: null,
      startedBlank: false,
      customTitle: null,
      note: null,
      pinned: false,
      groupId: null,
      emoji: null,
      committedUrl: null,
      permissionQueue: [],
      blocked: new Set(),
      systemRefused: new Set(),
      blockedPopups: [],
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
    deletedGroup?: ClosedGroup,
  ): void {
    const pages = ids.map((id): ClosedPage => {
      const node = workspace.tree.get(id);
      const page = this.require(id);
      return {
        id,
        parentId: node?.parentId ?? null,
        index: workspace.tree.indexOf(id),
        collapsed: this.collapsedIds.has(id),
        customTitle: page.customTitle,
        note: page.note,
        pinned: page.pinned,
        groupId: page.groupId,
        ...(page.emoji ? { emoji: page.emoji } : {}),
        state: page.state,
        history: page.host?.captureHistory() ?? page.history,
        createdAt: page.createdAt,
      };
    });
    const [first] = pages;
    if (!first && !deletedWorkspace && !deletedGroup) return;
    const label =
      deletedWorkspace?.name ??
      deletedGroup?.group.name ??
      nameOf(first!.customTitle, first!.state);
    // A deleted workspace or group is named, not shown by its first page.
    const shown = deletedWorkspace || deletedGroup ? undefined : first?.state;
    this.closed.push({
      workspaceId: workspace.id,
      workspace: deletedWorkspace,
      ...(deletedGroup ? { group: deletedGroup } : {}),
      pages,
      promotedChildIds,
      summary: {
        kind: deletedWorkspace ? 'workspace' : deletedGroup ? 'group' : 'pages',
        label,
        pageCount: pages.length,
        serial: ++this.closedSerial,
        ...(shown ? { url: shown.url, faviconUrl: shown.faviconUrl } : {}),
        ...(this.redoingClose ? { redone: true } : {}),
        ...(this.closingForDownload ? { forDownload: true } : {}),
      },
    });
    if (this.closed.length > MAX_CLOSED_RECORDS) this.closed.shift();
  }

  /**
   * A download started in a page, or was held because the page came back
   * by itself. A page showing a document keeps it, and its address goes back
   * to what it shows. A page opened only for this address, which a download
   * left empty, closes (undoably) like Chrome's tab does, and the page it
   * opened over comes back. Anything else says the address is a file.
   */
  private afterDownload(id: PageId, download: PageDownload): void {
    const page = this.pages.get(id);
    if (!page || this.closingIds.has(id)) return;
    if (download.hasDocument) {
      if (page.committedUrl !== null && page.state.url !== page.committedUrl)
        this.updateState(id, { url: page.committedUrl });
      if (download.firstHeld) {
        this.options.onNotice?.({
          kind: 'download-held',
          pageId: id,
          host: hostOf(page.committedUrl) ?? 'This page',
          filename: download.filename,
        });
      }
      return;
    }
    const kept =
      page.pinned ||
      page.customTitle !== null ||
      page.note !== null ||
      page.host?.captureHistory() != null;
    if (!download.held && page.startedBlank && !kept) {
      // Typed into an empty page: it stays, empty and ready for another.
      page.startedBlank = false;
      page.state = { ...page.state, url: null, isLoading: false, error: null };
      this.syncVisibleHost();
      this.changed();
      return;
    }
    page.state = {
      ...page.state,
      title: page.state.title || download.filename,
      isLoading: false,
      error: {
        kind: 'file-download',
        code: 0,
        description: download.filename,
        url: download.url,
      },
    };
    if (download.held || kept) {
      this.syncVisibleHost();
      this.changed();
      return;
    }
    // Reopened, it says what it was instead of asking the site again.
    this.closingForDownload = true;
    try {
      this.closePageNow(id, false, page.openedOver);
    } finally {
      this.closingForDownload = false;
    }
  }

  /**
   * What closing does to a pinned page: it stays in the trail and goes to
   * sleep, while a neighbour takes its place on screen. The only page left
   * stays awake. The shell says why and offers to unpin and close it.
   */
  private keepPinned(id: PageId): void {
    const workspace = this.workspaceOf(id);
    const page = this.require(id);
    if (this.viewOf(workspace).activePageId === id) {
      const neighbour =
        workspace.tree.branchSuccessorOf(id) ?? workspace.tree.successorOf(id);
      if (neighbour !== null) this.activatePage(neighbour, { steal: false });
    }
    const asleep =
      this.viewOf(workspace).activePageId !== id && !this.wantedByPeer(id);
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
      for (const viewer of this.trails.viewers) {
        const view = viewer.views.get(page.workspaceId);
        if (view?.split && inSplit(view.split, id)) view.split = null;
        viewer.collapsedIds.delete(id);
      }
    }
    this.forgetView(id);
    this.pages.delete(id);
    if (page) this.cancelPermissionRequests(page);
    page?.host?.destroy();
  }

  /**
   * Pages left a workspace. `successor` is what this window goes on to, and
   * `heir` is what a window that was showing one of them goes on to.
   */
  private afterRemoval(
    workspace: Workspace,
    successor: PageId | null,
    heir: PageId | null = successor,
  ): void {
    const view = this.viewOf(workspace);
    view.activePageId =
      successor !== null && this.pages.has(successor) ? successor : null;
    for (const viewer of this.trails.viewers) {
      if (viewer !== this) viewer.followRemoval(workspace, heir);
    }
    if (workspace.id === this.activeWorkspaceId && view.activePageId) {
      this.activatePage(view.activePageId, { steal: false });
    } else {
      this.syncVisibleHost();
      this.changed();
    }
  }

  /** Another window removed pages: moves on if this one was showing one. */
  private followRemoval(workspace: Workspace, heir: PageId | null): void {
    const view = this.views.get(workspace.id);
    if (!view) return;
    const { activePageId } = view;
    if (activePageId !== null && workspace.tree.has(activePageId)) return;
    view.activePageId =
      heir !== null && workspace.tree.has(heir)
        ? heir
        : (workspace.tree.rootIds[0] ?? null);
    if (workspace.id === this.activeWorkspaceId && view.activePageId) {
      this.activatePage(view.activePageId, { steal: false });
    } else {
      this.syncVisibleHost();
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
    // The page may have moved since: what it does belongs to its window now.
    const at = (): BrowserController => this.pages.get(id)?.holder ?? this;
    const host: PageHost = this.options.createHost({
      pageId: id,
      workspaceId: this.require(id).workspaceId,
      onStateChange: (patch) => {
        if (isCurrent()) at().updateState(id, patch);
      },
      onOpenRequest: (url, { background }) => {
        if (isCurrent()) {
          at().createPage({ url, parentId: id, activate: !background });
        }
      },
      onZoomChange: (percent) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return;
        // Chromium zooms the whole site; what the shell shows follows it.
        const site = originOf(page.state.url);
        for (const other of this.pages.values()) {
          if (other === page || (site && originOf(other.state.url) === site)) {
            other.state = { ...other.state, zoomPercent: percent };
          }
        }
        this.changed();
      },
      onPopupBlocked: (url) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return;
        const listed =
          url !== null &&
          !page.blockedPopups.includes(url) &&
          page.blockedPopups.length < MAX_BLOCKED_POPUPS;
        if (listed) page.blockedPopups.push(url);
        // A page looping on `window.open` shouldn't redraw the shell each time.
        if (!listed && page.blocked.has('popups')) return;
        page.blocked.add('popups');
        this.changed();
      },
      onBranchRequest: (url, referrer) => {
        if (isCurrent()) at().createPage({ url, parentId: id, referrer });
      },
      onNavigationCommand: (command) => {
        if (!isCurrent()) return;
        if (command === 'back') at().goBack(id);
        else if (command === 'forward') at().goForward(id);
        else at().reload(id);
      },
      navigationAvailability: () => this.trailNavigation(id),
      workspaceColors: () => {
        const page = this.pages.get(id);
        const workspace = page && this.workspaces.get(page.workspaceId);
        if (!workspace) return null;
        const { appearance } = workspace;
        return {
          accent: accentColors(appearance.accent),
          glow: appearanceColors(appearance)?.slice(0, 3) ?? null,
        };
      },
      searchUrlFor: (query) => searchUrl(query, this.options.search?.()),
      onFocus: () => {
        // Clicking into the other side of a split view makes it active.
        const viewer = at();
        if (
          isCurrent() &&
          viewer.activePageId !== id &&
          viewer.visibleIds.has(id)
        ) {
          viewer.activatePage(id);
        }
      },
      onDownload: (download) => {
        if (isCurrent()) at().afterDownload(id, download);
      },
      onNotice: (notice) => at().options.onNotice?.(notice),
      onFullscreenChange: (active) => {
        if (!isCurrent()) return;
        const viewer = at();
        if (active) viewer.fullscreenId = id;
        else if (viewer.fullscreenId === id) viewer.fullscreenId = null;
        viewer.syncVisibleHost();
      },
      onPermissionRequest: (origin, permissions, opens) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
          page.permissionQueue.push({
            request: {
              id: this.createId(),
              origin,
              permissions,
              ...(opens ? { opens } : {}),
            },
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
      onPermissionRefusedBySystem: (permissions) => {
        const page = this.pages.get(id);
        if (!isCurrent() || !page) return;
        const fresh = permissions.filter((p) => !page.systemRefused.has(p));
        if (fresh.length === 0) return;
        for (const permission of fresh) {
          page.blocked.add(permission);
          page.systemRefused.add(permission);
        }
        at().options.onNotice?.({
          kind: 'system-permission-refused',
          permissions: fresh,
          host: hostOf(page.committedUrl) ?? 'This site',
        });
        this.changed();
      },
    });
    this.require(id).holder = this;
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
      // Nobody asked for it just now, so if it answers with a file, it waits.
      page.host.load(page.state.url, { comingBack: true });
      page.state = { ...page.state, isLoading: true };
    }
  }

  private load(
    id: PageId,
    url: string,
    {
      referrer,
      plainAddress,
    }: { referrer?: string; plainAddress?: string | null } = {},
  ): void {
    if (!isPageUrl(url)) throw new Error(`Refusing to load ${url}`);
    const page = this.require(id);
    page.host ??= this.spawnHost(id);
    page.history = null;
    page.state = { ...page.state, url, error: null, isLoading: true };
    page.host.load(
      url,
      referrer === undefined && !plainAddress
        ? undefined
        : {
            ...(referrer === undefined ? {} : { referrer }),
            ...(plainAddress ? { plainAddress } : {}),
          },
    );
    this.syncVisibleHost();
    this.changed();
  }

  /** Discards the least recently used views beyond the budget. */
  private enforceLiveBudget(): void {
    const live = [...this.pages.entries()].filter(([, page]) => page.host);
    let excess =
      live.length - liveLimit(this.maxLiveViews, this.trails.memoryPressure);
    if (excess <= 0) return;
    const wanted = new Set(
      [...this.trails.viewers].flatMap((viewer) => viewer.wantedIds()),
    );
    const candidates = live
      .filter(
        ([id, page]) =>
          !wanted.has(id) &&
          !this.visibleIds.has(id) &&
          !page.host?.isAudible() &&
          !page.host?.isInUse?.() &&
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
        page.systemRefused.clear();
      }
      if (previous === null || !isSameDocumentUrl(patch.url, previous)) {
        // Popups are stopped per document; a new one starts with a clean slate.
        page.blockedPopups = [];
        page.blocked.delete('popups');
        this.options.onVisit?.(patch.url, page.workspaceId);
      }
    }
    if (patch.title && url) {
      this.options.onTitle?.(url, patch.title, page.workspaceId);
    }
    if (patch.faviconUrl && url) {
      this.options.onFavicon?.(url, patch.faviconUrl, page.workspaceId);
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
        page.holder === this &&
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
        if (node && !this.collapsedIds.has(id)) visit(node.childIds);
      }
    };
    visit(tree.rootIds);
    return rows;
  }

  /** The workspace's split view, if it is on screen. */
  private visibleSplit(workspace: Workspace): SplitView | null {
    const { split, activePageId } = this.viewOf(workspace);
    return split && activePageId !== null && inSplit(split, activePageId)
      ? split
      : null;
  }

  /** Every window redraws: they all show the same trails. */
  private changed(): void {
    for (const viewer of this.trails.viewers) viewer.queueSnapshot();
  }

  private queueSnapshot(): void {
    if (this.flushPending || this.disposed) return;
    this.flushPending = true;
    this.schedule(() => {
      this.flushPending = false;
      if (this.disposed) return;
      this.settle();
      this.options.onSnapshot(this.snapshot());
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

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
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
