import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from 'electron';
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
  listVault: () => invoke('vault:list'),
  saveLogin: (fields) => invoke('vault:save-login', fields),
  saveAddress: (fields, id) => invoke('vault:save-address', { id, fields }),
  saveCard: (fields, id) => invoke('vault:save-card', { id, fields }),
  deleteVaultItem: (id) => invoke('vault:delete', { id }),
  undoVaultDelete: (token) => invoke('vault:undo', { token }),
  revealPassword: (id) => invoke('vault:reveal', { id }),
  copyPassword: (id) => invoke('vault:copy', { id }),
  exportPasswords: () => invoke('vault:export'),
  importSources: () => invoke('transfer:sources'),
  importFrom: (id, what) => invoke('transfer:import', { id, ...what }),
  importFile: () => invoke('transfer:import-file'),
  undoImport: (token) => invoke('transfer:undo', { token }),
  trashImportedFile: (token) => invoke('transfer:trash', { token }),
  exportBookmarks: () => invoke('transfer:export-bookmarks'),
  exportTrail: () => invoke('transfer:export-trail'),
  currentAutofill: () => invoke('autofill:current'),
  chooseAutofill: (id) => invoke('autofill:choose', { id }),
  resizeAutofill: (height) => send('autofill:resize', { height }),
  onAutofill: (listener) => subscribe(eventChannels.autofill, listener),
  answerCredentialPrompt: (id, answer) =>
    invoke('credential:respond', { id, answer }),
  onCredentialPrompt: (listener) =>
    subscribe(eventChannels.credentialPrompt, listener),
  windowInfo: () => invoke('window:info'),
  newPrivateWindow: () => invoke('window:new-private'),
  becomeDefaultBrowser: () => invoke('app:make-default-browser'),
  chooseFiles: () => invoke('file:choose'),
  openSettingsSection: (section) =>
    invoke('app:open-settings-section', { section }),
  togglePictureInPicture: (pageId) =>
    invoke('page:picture-in-picture', { pageId }),
  manageExtensions: () => invoke('extensions:manage'),
  listExtensions: () => invoke('extensions:list'),
  onExtensions: (listener) => subscribe(eventChannels.extensions, listener),
  setExtensionEnabled: (id, enabled) =>
    invoke('extensions:set-enabled', { id, enabled }),
  removeExtension: (id) => invoke('extensions:remove', { id }),
  openWebStore: () => invoke('extensions:open-store'),
  openExtensionPage: (url) => invoke('extensions:open-page', { url }),
  loadUnpackedExtension: () => invoke('extensions:load-unpacked'),
  takeSettingsSection: () => invoke('settings:take-section'),
  onSettingsSection: (listener) =>
    subscribe(eventChannels.settingsSection, listener),
  sharePage: (pageId) => invoke('page:share', { pageId }),
  copyPageAs: (pageId, format) => invoke('page:copy-as', { pageId, format }),
  pasteAndGo: () => invoke('page:paste-and-go'),
  goHome: () => invoke('page:go-home'),
  showAddressMenu: () => invoke('address:show-menu'),
  getAuthChallenge: () => invoke('auth:challenge'),
  respondAuth: (credentials) => invoke('auth:respond', credentials),
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
  continueOverHttp: (pageId) => invoke('page:continue-over-http', { pageId }),
  continueToDangerousSite: (pageId) =>
    invoke('page:continue-to-dangerous-site', { pageId }),
  continuePastCertificate: (pageId) =>
    invoke('page:continue-past-certificate', { pageId }),
  stop: (pageId) => invoke('page:stop', { pageId }),
  setCollapsed: (pageId, collapsed) =>
    invoke('page:set-collapsed', { pageId, collapsed }),
  createChildPage: (pageId, input) =>
    invoke('page:create-child', { pageId, input }),
  createSiblingPage: (pageId, input) =>
    invoke('page:create-sibling', { pageId, input }),
  setPageEmoji: (pageId, emoji) => invoke('page:set-emoji', { pageId, emoji }),
  collapseOtherTrails: (pageId) => invoke('trail:collapse-others', { pageId }),
  setTrailsCollapsed: (pageIds, groupIds, collapsed) =>
    invoke('trail:set-collapsed', { pageIds, groupIds, collapsed }),
  importTrailFile: () => invoke('trail:import-file'),
  pasteOutline: (parentId) => invoke('trail:paste-outline', { parentId }),
  undoTrailImport: (pageIds, groupId) =>
    invoke('trail:undo-import', { pageIds, groupId }),
  dragTrailOut: (target) => invoke('trail:drag-out', target),
  closeBranch: (pageId) => invoke('page:close-branch', { pageId }),
  closeOtherPages: (pageId) => invoke('page:close-others', { pageId }),
  closePagesBelow: (pageId) => invoke('page:close-below', { pageId }),
  listDictionaryWords: () => invoke('spelling:words'),
  setDictionaryWord: (word, known) =>
    invoke('spelling:set-word', { word, known }),
  viewSource: (pageId) => invoke('page:view-source', { pageId }),
  toggleDevTools: (pageId) => invoke('page:toggle-devtools', { pageId }),
  print: (pageId) => invoke('page:print', { pageId }),
  savePageAs: (pageId) => invoke('page:save-as', { pageId }),
  deleteWorkspaceFromShell: (workspaceId) =>
    invoke('workspace:delete', { workspaceId }),
  reopenClosed: () => invoke('page:reopen-closed'),
  reopenClosedItem: (serial) => invoke('page:reopen-closed-item', { serial }),
  recentlyClosed: () => invoke('page:recently-closed'),
  undoClose: (serial) => invoke('page:undo-close', { serial }),
  closeAgain: (serial) => invoke('page:close-again', { serial }),
  movePage: (pageId, parentId, afterId) =>
    invoke('page:move', { pageId, parentId, afterId }),
  returnPage: (pageId, origin) => invoke('page:return', { pageId, origin }),
  setPinned: (pageId, pinned, origin) =>
    invoke('page:set-pinned', { pageId, pinned, origin }),
  createGroup: (name, pageId) => invoke('group:create', { name, pageId }),
  renameGroup: (groupId, name) => invoke('group:rename', { groupId, name }),
  setGroupCollapsed: (groupId, collapsed) =>
    invoke('group:set-collapsed', { groupId, collapsed }),
  setGroupIcon: (groupId, icon) => invoke('group:set-icon', { groupId, icon }),
  deleteGroup: (groupId) => invoke('group:delete', { groupId }),
  deleteGroupWithPages: (groupId) =>
    invoke('group:delete-with-pages', { groupId }),
  setPageGroup: (pageId, groupId) =>
    invoke('page:set-group', { pageId, groupId }),
  openSettings: () => invoke('app:open-settings'),
  renamePage: (pageId, title) => invoke('page:rename', { pageId, title }),
  duplicatePage: (pageId) => invoke('page:duplicate', { pageId }),
  movePageToWorkspace: (pageId, workspaceId) =>
    invoke('page:move-to-workspace', { pageId, workspaceId }),
  movePageToWindow: (pageId, windowId) =>
    invoke('page:move-to-window', { pageId, windowId }),
  setNote: (pageId, note) => invoke('page:set-note', { pageId, note }),
  openSplit: (pageId, otherId, side) =>
    invoke('page:open-split', { pageId, otherId, side }),
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
  openBlockedPopup: (pageId, url) =>
    invoke('page:open-blocked-popup', { pageId, url }),
  respondToPermission: (pageId, requestId, granted) =>
    invoke('page:respond-permission', { pageId, requestId, granted }),
  getSiteInfo: (pageId) => invoke('site:get-info', { pageId }),
  openPermissionSettings: (permission) =>
    invoke('system:open-permission-settings', { permission }),
  setSitePermission: (origin, permission, decision) =>
    invoke('site:set-permission', { origin, permission, decision }),
  resetSite: (origin) => invoke('site:reset', { origin }),
  freezePage: () => invoke('view:freeze'),
  setOverlayActive: (active) => send('view:set-overlay', { active }),
  setTrailUndoOffered: (offered) =>
    send('view:set-trail-undo-offered', { offered }),
  previewWorkspaceMode: (mode) => send('workspace:preview-mode', { mode }),
  queryPalette: (query, scope, complete) =>
    invoke('palette:query', { query, scope, complete }),
  suggestSearch: (query) => invoke('search:suggest', { query }),
  siteIcon: (url) => invoke('search:site-icon', { url }),
  moveWorkspace: (workspaceId, index) =>
    invoke('workspace:move', { workspaceId, index }),
  setContentInsets: (insets) => send('view:set-content-insets', insets),
  focusPage: () => send('view:focus-page'),
  onSnapshot: (listener) => subscribe(eventChannels.snapshot, listener),
  onUiCommand: (listener) => subscribe(eventChannels.uiCommand, listener),
  onNotice: (listener) => subscribe(eventChannels.notice, listener),
  listTasks: () => invoke('tasks:list'),
  endTask: (pageId) => invoke('tasks:end', { pageId }),
  listDownloads: () => invoke('downloads:list'),
  actOnDownload: (id, action) => invoke('downloads:act', { id, action }),
  clearDownloads: () => invoke('downloads:clear'),
  openDownloadsFolder: () => invoke('downloads:open-folder'),
  onDownloads: (listener) => subscribe(eventChannels.downloads, listener),
  listHistory: (query, limit) => invoke('history:list', { query, limit }),
  deleteHistoryEntry: (url) => invoke('history:delete', { url }),
  restoreHistoryEntry: (entry) => invoke('history:restore', { entry }),
  listSiteSettings: () => invoke('settings:sites'),
  getThreatListStatus: () => invoke('settings:threat-list'),
  listCookies: (host) => invoke('cookies:list', { host }),
  deleteCookies: (site, only) => invoke('cookies:delete', { site, only }),
  undoDeleteCookies: (token) => invoke('cookies:undo', { token }),
  contentBlockingStatus: () => invoke('settings:content-blocking'),
  updateFilterLists: () => invoke('settings:update-filter-lists'),
  clearBrowsingData: (request) => invoke('settings:clear-data', request),
  undoClearBrowsingData: (token) => invoke('settings:undo-clear', { token }),
  defaultBrowserStatus: () => invoke('settings:default-browser'),
  makeDefaultBrowser: () => invoke('settings:make-default-browser'),
  openDataFolder: () => invoke('settings:open-data-folder'),
  about: () => invoke('settings:about'),
  licence: (name) => invoke('settings:licence', { name }),
  openChromiumLicences: () => invoke('settings:open-chromium-licences'),
  openAboutLink: (link) => invoke('settings:open-about-link', { link }),
  exportDiagnostics: () => invoke('settings:export-diagnostics'),
  showCrashReports: () => invoke('settings:show-crash-reports'),
  editWorkspace: (workspaceId) =>
    invoke('settings:edit-workspace', { workspaceId }),
  deleteWorkspace: (workspaceId) =>
    invoke('settings:delete-workspace', { workspaceId }),
  storageStatus: () => invoke('storage:status'),
  onStorageStatus: (listener) => subscribe(eventChannels.storage, listener),
  getPreferences: () => invoke('preferences:get'),
  updatePreferences: (patch) => invoke('preferences:update', { patch }),
  onPreferences: (listener) => subscribe(eventChannels.preferences, listener),
  placeAiPanel: (placement) => send('ai:place', placement),
  actOnAiPanel: (action) => invoke('ai:act', { action }),
  onAiPanel: (listener) => subscribe(eventChannels.aiPanel, listener),
};

contextBridge.exposeInMainWorld('splash', api);

/*
 * A file dragged from the Finder onto the window opens as a page. It's handled
 * here because only this side can learn where a dropped file is; the shell's
 * own drop targets take links, and never see these. (Over a page, the page's
 * preload does the same.)
 */
const dragsFiles = (event: DragEvent) =>
  event.isTrusted && !!event.dataTransfer?.types.includes('Files');
window.addEventListener('dragover', (event) => {
  if (dragsFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (!dragsFiles(event)) return;
  event.preventDefault();
  const paths = [...(event.dataTransfer?.files ?? [])]
    .map((file) => webUtils.getPathForFile(file))
    .filter(Boolean)
    .slice(0, 50);
  if (paths.length > 0) void invoke('file:open-dropped', { paths });
});

// Defines <browser-action-list>, the toolbar buttons of extensions such as
// uBlock Origin. Its clicks and popups are handled by the main process.
injectBrowserAction();
