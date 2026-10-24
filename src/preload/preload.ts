import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
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
  backend: 'electron',
  platform: process.platform,
  getSnapshot: () => invoke('browser:get-snapshot'),
  createPage: (request = {}) => invoke('page:create', request),
  activatePage: (pageId) => invoke('page:activate', { pageId }),
  closePage: (pageId, options = {}) =>
    invoke('page:close', { pageId, ...options }),
  navigate: (pageId, input) => invoke('page:navigate', { pageId, input }),
  goBack: (pageId) => invoke('page:go-back', { pageId }),
  goForward: (pageId) => invoke('page:go-forward', { pageId }),
  reload: (pageId) => invoke('page:reload', { pageId }),
  stop: (pageId) => invoke('page:stop', { pageId }),
  setCollapsed: (pageId, collapsed) =>
    invoke('page:set-collapsed', { pageId, collapsed }),
  renamePage: (pageId, title) => invoke('page:rename', { pageId, title }),
  movePage: (pageId, parentId, beforeId) =>
    invoke('page:move', { pageId, parentId, beforeId }),
  createWorkspace: (name) => invoke('workspace:create', { name }),
  activateWorkspace: (workspaceId) =>
    invoke('workspace:activate', { workspaceId }),
  renameWorkspace: (workspaceId, name) =>
    invoke('workspace:rename', { workspaceId, name }),
  deleteWorkspace: (workspaceId) => invoke('workspace:delete', { workspaceId }),
  setContentInsets: (insets) => send('view:set-content-insets', insets),
  setAppearance: (appearance) => send('app:set-appearance', appearance),
  focusPage: () => send('view:focus-page'),
  onSnapshot: (listener) => subscribe(eventChannels.snapshot, listener),
  onUiCommand: (listener) => subscribe(eventChannels.uiCommand, listener),
};

contextBridge.exposeInMainWorld('splash', api);
