import {
  WORKSPACE_COLORS,
  type BrowserSnapshot,
  type PageId,
  type PageSnapshot,
  type WorkspaceColor,
  type WorkspaceId,
} from '../shared/types';
import type {
  Bounds,
  PageHost,
  PageHostFactory,
  PageRuntimeState,
} from './page-host';
import { TrailTree } from './trail-tree';
import { isNavigableUrl, resolveAddressInput } from './url';

interface Page {
  host: PageHost;
  state: PageRuntimeState;
  workspaceId: WorkspaceId;
  customTitle: string | null;
}

interface Workspace {
  id: WorkspaceId;
  name: string;
  color: WorkspaceColor;
  tree: TrailTree;
  activePageId: PageId | null;
}

export interface BrowserControllerOptions {
  createHost: PageHostFactory;
  onSnapshot(snapshot: BrowserSnapshot): void;
  /** Coalesces snapshot emissions; defaults to one per microtask. */
  schedule?: (flush: () => void) => void;
  createId?: () => string;
  /** Name of the workspace every controller starts with. */
  initialWorkspaceName?: string;
}

export interface CreatePageOptions {
  /** Address-bar input; resolved to a URL or a search. */
  input?: string;
  /** An already-validated http(s) URL. */
  url?: string;
  parentId?: PageId | null;
  activate?: boolean;
  /** For root pages; children always join their parent's workspace. */
  workspaceId?: WorkspaceId;
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
 * Owns the pages of one window: its workspaces, each with an independent
 * trail tree and active page, every page's live state, and which page's view
 * is on screen. Electron-specific work is delegated to `PageHost`s so this
 * class runs in plain Node and in the shell's mock backend.
 */
export class BrowserController {
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private readonly pages = new Map<PageId, Page>();
  private activeWorkspaceId: WorkspaceId;
  private visibleId: PageId | null = null;
  private bounds: Bounds | null = null;
  private flushPending = false;
  private disposed = false;

  private readonly schedule: (flush: () => void) => void;
  private readonly createId: () => string;

  constructor(private readonly options: BrowserControllerOptions) {
    // Wrapped: browsers reject `queueMicrotask` called as a method.
    this.schedule = options.schedule ?? ((flush) => queueMicrotask(flush));
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.activeWorkspaceId = this.addWorkspace(
      options.initialWorkspaceName ?? 'Personal',
    );
  }

  get activePageId(): PageId | null {
    return this.activeWorkspace.activePageId;
  }

  get workspaceId(): WorkspaceId {
    return this.activeWorkspaceId;
  }

  createPage(options: CreatePageOptions = {}): PageId {
    const { parentId = null, activate = true } = options;
    const workspace =
      parentId !== null
        ? this.workspaceOf(parentId)
        : this.requireWorkspace(options.workspaceId ?? this.activeWorkspaceId);
    const id = this.createId();
    const host = this.options.createHost({
      onStateChange: (patch) => this.updateState(id, patch),
      onOpenRequest: (url, { background }) => {
        if (!this.pages.has(id)) return;
        this.createPage({ url, parentId: id, activate: !background });
      },
    });
    workspace.tree.add(id, parentId);
    this.pages.set(id, {
      host,
      state: { ...EMPTY_STATE },
      workspaceId: workspace.id,
      customTitle: null,
    });

    const url =
      options.url !== undefined
        ? options.url
        : options.input !== undefined
          ? resolveAddressInput(options.input)
          : null;
    if (url !== null) this.load(id, url);

    if (activate && workspace.id === this.activeWorkspaceId) {
      this.activatePage(id);
    } else {
      if (activate || workspace.activePageId === null) {
        workspace.activePageId = id;
      }
      this.changed();
    }
    return id;
  }

  /** Shows a page, switching to its workspace if needed. */
  activatePage(id: PageId): void {
    this.require(id);
    const workspace = this.workspaceOf(id);
    workspace.activePageId = id;
    workspace.tree.reveal(id);
    this.activeWorkspaceId = workspace.id;
    this.syncVisibleHost();
    this.changed();
  }

  closePage(id: PageId, { withDescendants = false } = {}): void {
    this.require(id);
    const workspace = this.workspaceOf(id);
    const { tree } = workspace;
    const doomed = withDescendants ? [id, ...tree.descendantsOf(id)] : [id];

    if (workspace.activePageId !== null) {
      if (doomed.includes(workspace.activePageId)) {
        workspace.activePageId = tree.successorOf(id, withDescendants);
      }
    }
    if (withDescendants) tree.removeSubtree(id);
    else tree.remove(id);
    this.destroyPages(doomed);
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
    this.workspaceOf(id).tree.setCollapsed(id, collapsed);
    this.changed();
  }

  /** Gives a page a name of the user's choosing; empty or `null` clears it. */
  renamePage(id: PageId, title: string | null): void {
    const page = this.require(id);
    page.customTitle = title?.trim() || null;
    this.changed();
  }

  /**
   * Moves a page and its subtree within its workspace. The new parent is
   * expanded so the page stays in view where it was put.
   */
  movePage(id: PageId, parentId: PageId | null, beforeId: PageId | null): void {
    this.require(id);
    const { tree } = this.workspaceOf(id);
    for (const other of [parentId, beforeId]) {
      if (other !== null && !tree.has(other)) {
        throw new Error(`Page ${other} is not in the same workspace`);
      }
    }
    tree.move(id, parentId, beforeId);
    tree.reveal(id);
    this.changed();
  }

  createWorkspace(name: string, { activate = false } = {}): WorkspaceId {
    const id = this.addWorkspace(name);
    if (activate) this.activateWorkspace(id);
    else this.changed();
    return id;
  }

  activateWorkspace(id: WorkspaceId): void {
    this.requireWorkspace(id);
    this.activeWorkspaceId = id;
    this.syncVisibleHost();
    this.changed();
  }

  renameWorkspace(id: WorkspaceId, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A workspace needs a name');
    this.requireWorkspace(id).name = trimmed;
    this.changed();
  }

  /** Deletes a workspace and closes its pages. The last one cannot go. */
  deleteWorkspace(id: WorkspaceId): void {
    const workspace = this.requireWorkspace(id);
    if (this.workspaces.size === 1) {
      throw new Error('Cannot delete the only workspace');
    }
    if (this.activeWorkspaceId === id) {
      const ids = [...this.workspaces.keys()];
      const index = ids.indexOf(id);
      this.activeWorkspaceId = (ids[index + 1] ?? ids[index - 1])!;
    }
    this.workspaces.delete(id);
    this.destroyPages(workspace.tree.order());
    this.syncVisibleHost();
    this.changed();
  }

  setContentBounds(bounds: Bounds): void {
    this.bounds = bounds;
    this.syncVisibleHost();
  }

  focusActivePage(): void {
    const id = this.activePageId;
    if (id !== null && this.visibleId === id) this.require(id).host.focus();
  }

  snapshot(): BrowserSnapshot {
    const workspace = this.activeWorkspace;
    const { tree } = workspace;
    const pages: Record<PageId, PageSnapshot> = {};
    for (const id of tree.order()) {
      const node = tree.get(id);
      const page = this.pages.get(id);
      if (!node || !page) continue;
      pages[id] = {
        id,
        parentId: node.parentId,
        childIds: [...node.childIds],
        collapsed: node.collapsed,
        customTitle: page.customTitle,
        ...page.state,
      };
    }
    return {
      workspaces: [...this.workspaces.values()].map((w) => ({
        id: w.id,
        name: w.name,
        color: w.color,
        pageCount: w.tree.size,
      })),
      activeWorkspaceId: workspace.id,
      pages,
      rootIds: [...tree.rootIds],
      activePageId: workspace.activePageId,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const page of this.pages.values()) page.host.destroy();
    this.pages.clear();
    this.visibleId = null;
  }

  private get activeWorkspace(): Workspace {
    return this.requireWorkspace(this.activeWorkspaceId);
  }

  private addWorkspace(name: string): WorkspaceId {
    const id = this.createId();
    const color =
      WORKSPACE_COLORS[this.workspaces.size % WORKSPACE_COLORS.length]!;
    this.workspaces.set(id, {
      id,
      name: name.trim() || 'Workspace',
      color,
      tree: new TrailTree(),
      activePageId: null,
    });
    return id;
  }

  private destroyPages(ids: readonly PageId[]): void {
    for (const id of ids) {
      const page = this.pages.get(id);
      if (!page) continue;
      if (this.visibleId === id) this.visibleId = null;
      this.pages.delete(id);
      page.host.destroy();
    }
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
    const activeId = this.activePageId;
    const active = activeId === null ? undefined : this.pages.get(activeId);
    const shouldShow =
      active !== undefined &&
      this.bounds !== null &&
      active.state.url !== null &&
      active.state.error === null;
    const nextId = shouldShow ? activeId : null;

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

  private workspaceOf(id: PageId): Workspace {
    return this.requireWorkspace(this.require(id).workspaceId);
  }

  private requireWorkspace(id: WorkspaceId): Workspace {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error(`Workspace ${id} does not exist`);
    return workspace;
  }

  private require(id: PageId): Page {
    const page = this.pages.get(id);
    if (!page) throw new Error(`Page ${id} does not exist`);
    return page;
  }
}
