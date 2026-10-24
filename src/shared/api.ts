import type {
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
  'page:create-child': PageId;
  'page:close-branch': void;
  'page:reopen-closed': PageId | null;
  'page:move': void;
  'page:rename': void;
  'page:duplicate': PageId;
  'page:show-menu': void;
  'page:set-note': void;
  'workspace:switch': void;
  'workspace:rename': void;
  'workspace:show-menu': void;
  'workspace:create': WorkspaceId;
  'workspace:move': void;
}

export const eventChannels = {
  snapshot: 'browser:snapshot',
  uiCommand: 'ui:command',
} as const;

/** The API the preload script exposes on `window.splash`. */
export interface SplashApi {
  platform: NodeJS.Platform;
  getSnapshot(): Promise<BrowserSnapshot>;
  createPage(input?: string): Promise<PageId>;
  activatePage(pageId: PageId): Promise<void>;
  closePage(pageId: PageId): Promise<void>;
  navigate(pageId: PageId, input: string): Promise<void>;
  goBack(pageId: PageId): Promise<void>;
  goForward(pageId: PageId): Promise<void>;
  reload(pageId: PageId): Promise<void>;
  stop(pageId: PageId): Promise<void>;
  setCollapsed(pageId: PageId, collapsed: boolean): Promise<void>;
  createChildPage(pageId: PageId): Promise<PageId>;
  closeBranch(pageId: PageId): Promise<void>;
  reopenClosed(): Promise<PageId | null>;
  /** Moves a page under `parentId`, right after `afterId` (first if null). */
  movePage(
    pageId: PageId,
    parentId: PageId | null,
    afterId: PageId | null,
  ): Promise<void>;
  renamePage(pageId: PageId, title: string | null): Promise<void>;
  duplicatePage(pageId: PageId): Promise<PageId>;
  /** Opens the native context menu for a page in the sidebar. */
  showPageMenu(pageId: PageId): Promise<void>;
  setNote(pageId: PageId, note: string | null): Promise<void>;
  switchWorkspace(workspaceId: WorkspaceId): Promise<void>;
  renameWorkspace(workspaceId: WorkspaceId, name: string): Promise<void>;
  showWorkspaceMenu(): Promise<void>;
  createWorkspace(): Promise<WorkspaceId>;
  moveWorkspace(workspaceId: WorkspaceId, index: number): Promise<void>;
  setContentInsets(insets: ContentInsets): void;
  focusPage(): void;
  onSnapshot(listener: (snapshot: BrowserSnapshot) => void): () => void;
  onUiCommand(listener: (command: UiCommand) => void): () => void;
}
