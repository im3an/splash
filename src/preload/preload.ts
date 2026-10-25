import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';
import {
  eventChannels,
  type InvokeOutputs,
  type SplashApi,
} from '../shared/api';
import type { InvokeChannel, SendChannel } from '../shared/ipc';

/*
 * The only bridge between the shell UI and the main process. It exposes a
 * fixed set of functions — never `ipcRenderer` itself — and the main process
 * validates every argument, so nothing here is trusted.
 */

function invoke<C extends InvokeChannel>(
  channel: C,
  input?: unknown,
): Promise<InvokeOutputs[C]> {
  return ipcRenderer.invoke(channel, input);
}

function send(channel: SendChannel, input?: unknown): void {
  ipcRenderer.send(channel, input);
}

function subscribe<T>(channel: string, listener: (value: T) => void) {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: SplashApi = {
  platform: process.platform,
  getSnapshot: () => invoke('browser:get-snapshot'),
  createPage: (input) =>
    invoke('page:create', input === undefined ? {} : { input }),
  activatePage: (pageId) => invoke('page:activate', { pageId }),
  closePage: (pageId, options) =>
    invoke('page:close', { pageId, unpin: options?.unpin }),
  navigate: (pageId, input) => invoke('page:navigate', { pageId, input }),
  goBack: (pageId) => invoke('page:go-back', { pageId }),
  goForward: (pageId) => invoke('page:go-forward', { pageId }),
  reload: (pageId) => invoke('page:reload', { pageId }),
  stop: (pageId) => invoke('page:stop', { pageId }),
  setCollapsed: (pageId, collapsed) =>
    invoke('page:set-collapsed', { pageId, collapsed }),
  createChildPage: (pageId) => invoke('page:create-child', { pageId }),
  closeBranch: (pageId) => invoke('page:close-branch', { pageId }),
  reopenClosed: () => invoke('page:reopen-closed'),
  movePage: (pageId, parentId, afterId) =>
    invoke('page:move', { pageId, parentId, afterId }),
  returnPage: (pageId, origin) => invoke('page:return', { pageId, origin }),
  setPinned: (pageId, pinned, origin) =>
    invoke('page:set-pinned', { pageId, pinned, origin }),
  openSettings: () => invoke('app:open-settings'),
  renamePage: (pageId, title) => invoke('page:rename', { pageId, title }),
  duplicatePage: (pageId) => invoke('page:duplicate', { pageId }),
  showPageMenu: (pageId) => invoke('page:show-menu', { pageId }),
  setNote: (pageId, note) => invoke('page:set-note', { pageId, note }),
  openSplit: (pageId, otherId) =>
    invoke('page:open-split', { pageId, otherId }),
  toggleSplit: (pageId) => invoke('page:toggle-split', { pageId }),
  closeSplit: () => invoke('split:close'),
  switchWorkspace: (workspaceId) => invoke('workspace:switch', { workspaceId }),
  renameWorkspace: (workspaceId, name) =>
    invoke('workspace:rename', { workspaceId, name }),
  showWorkspaceMenu: () => invoke('workspace:show-menu'),
  createWorkspace: (name, appearance) =>
    invoke('workspace:create', { name, appearance }),
  customizeWorkspace: (workspaceId, name, appearance) =>
    invoke('workspace:customize', { workspaceId, name, appearance }),
  setMuted: (pageId, muted) => invoke('page:set-muted', { pageId, muted }),
  zoom: (pageId, direction) => invoke('page:zoom', { pageId, direction }),
  find: (pageId, text, { forward, findNext }) =>
    invoke('page:find', { pageId, text, forward, findNext }),
  stopFind: (pageId) => invoke('page:stop-find', { pageId }),
  respondToPermission: (pageId, requestId, granted) =>
    invoke('page:respond-permission', { pageId, requestId, granted }),
  getSiteInfo: (pageId) => invoke('site:get-info', { pageId }),
  setSitePermission: (origin, permission, decision) =>
    invoke('site:set-permission', { origin, permission, decision }),
  resetSite: (origin) => invoke('site:reset', { origin }),
  freezePage: () => invoke('view:freeze'),
  setOverlayActive: (active) => send('view:set-overlay', { active }),
  queryPalette: (query, scope, complete) =>
    invoke('palette:query', { query, scope, complete }),
  suggestSearch: (query) => invoke('search:suggest', { query }),
  moveWorkspace: (workspaceId, index) =>
    invoke('workspace:move', { workspaceId, index }),
  setContentInsets: (insets) => send('view:set-content-insets', insets),
  focusPage: () => send('view:focus-page'),
  onSnapshot: (listener) => subscribe(eventChannels.snapshot, listener),
  onUiCommand: (listener) => subscribe(eventChannels.uiCommand, listener),
  onNotice: (listener) => subscribe(eventChannels.notice, listener),
  listDownloads: () => invoke('downloads:list'),
  actOnDownload: (id, action) => invoke('downloads:act', { id, action }),
  clearDownloads: () => invoke('downloads:clear'),
  openDownloadsFolder: () => invoke('downloads:open-folder'),
  onDownloads: (listener) => subscribe(eventChannels.downloads, listener),
  listHistory: (query, limit) => invoke('history:list', { query, limit }),
  deleteHistoryEntry: (url) => invoke('history:delete', { url }),
  restoreHistoryEntry: (entry) => invoke('history:restore', { entry }),
  listSiteSettings: () => invoke('settings:sites'),
  contentBlockingStatus: () => invoke('settings:content-blocking'),
  updateFilterLists: () => invoke('settings:update-filter-lists'),
  clearBrowsingData: (request) => invoke('settings:clear-data', request),
  undoClearBrowsingData: (token) => invoke('settings:undo-clear', { token }),
  defaultBrowserStatus: () => invoke('settings:default-browser'),
  makeDefaultBrowser: () => invoke('settings:make-default-browser'),
  openDataFolder: () => invoke('settings:open-data-folder'),
  about: () => invoke('settings:about'),
  editWorkspace: (workspaceId) =>
    invoke('settings:edit-workspace', { workspaceId }),
  deleteWorkspace: (workspaceId) =>
    invoke('settings:delete-workspace', { workspaceId }),
  storageStatus: () => invoke('storage:status'),
  onStorageStatus: (listener) => subscribe(eventChannels.storage, listener),
  getPreferences: () => invoke('preferences:get'),
  updatePreferences: (patch) => invoke('preferences:update', { patch }),
  onPreferences: (listener) => subscribe(eventChannels.preferences, listener),
};

contextBridge.exposeInMainWorld('splash', api);

// Defines <browser-action-list>, the toolbar buttons of extensions such as
// uBlock Origin. Its clicks and popups are handled by the main process.
injectBrowserAction();
