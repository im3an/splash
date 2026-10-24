import type {
  Appearance,
  BrowserSnapshot,
  ContentInsets,
  PageId,
  UiCommand,
  WorkspaceId,
} from './types';

export interface InvokeOutputs {
  'browser:get-snapshot': BrowserSnapshot;
  'page:create': PageId;
  'page:activate': void;
  'page:close': void;
  'page:navigate': void;
  'page:go-back': void;
  'page:go-forward': void;
  'page:reload': void;
  'page:stop': void;
  'page:set-collapsed': void;
  'page:rename': void;
  'page:move': void;
  'workspace:create': WorkspaceId;
  'workspace:activate': void;
  'workspace:rename': void;
  'workspace:delete': void;
}

export const eventChannels = {
  snapshot: 'browser:snapshot',
  uiCommand: 'ui:command',
} as const;

export interface CreatePageRequest {
  /** Address-bar input; omitted for an empty page. */
  input?: string;
  /** Creates the page as the last child of this page. */
  parentId?: PageId;
}

export interface ClosePageOptions {
  /** Also close every page nested under it, instead of promoting them. */
  withDescendants?: boolean;
}

/**
 * The browser the shell drives. In the app this is the preload bridge to the
 * main process; when the shell runs in a plain browser it is the mock backend.
 */
export interface SplashApi {
  /** `mock` pages are simulated and drawn by the shell itself. */
  backend: 'electron' | 'mock';
  platform: string;
  getSnapshot(): Promise<BrowserSnapshot>;
  createPage(request?: CreatePageRequest): Promise<PageId>;
  activatePage(pageId: PageId): Promise<void>;
  closePage(pageId: PageId, options?: ClosePageOptions): Promise<void>;
  navigate(pageId: PageId, input: string): Promise<void>;
  goBack(pageId: PageId): Promise<void>;
  goForward(pageId: PageId): Promise<void>;
  reload(pageId: PageId): Promise<void>;
  stop(pageId: PageId): Promise<void>;
  setCollapsed(pageId: PageId, collapsed: boolean): Promise<void>;
  /** `null` restores the page's own title. */
  renamePage(pageId: PageId, title: string | null): Promise<void>;
  /** Moves a page (with its children) under `parentId`, before `beforeId` or last. */
  movePage(
    pageId: PageId,
    parentId: PageId | null,
    beforeId: PageId | null,
  ): Promise<void>;
  createWorkspace(name: string): Promise<WorkspaceId>;
  activateWorkspace(workspaceId: WorkspaceId): Promise<void>;
  renameWorkspace(workspaceId: WorkspaceId, name: string): Promise<void>;
  deleteWorkspace(workspaceId: WorkspaceId): Promise<void>;
  setContentInsets(insets: ContentInsets): void;
  setAppearance(appearance: Appearance): void;
  focusPage(): void;
  onSnapshot(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onUiCommand(listener: (command: UiCommand) => void): () => void;
}
