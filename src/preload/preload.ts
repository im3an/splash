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
  platform: process.platform,
  getSnapshot: () => invoke('browser:get-snapshot'),
  createPage: (input) =>
    invoke('page:create', input === undefined ? {} : { input }),
  activatePage: (pageId) => invoke('page:activate', { pageId }),
  closePage: (pageId) => invoke('page:close', { pageId }),
  navigate: (pageId, input) => invoke('page:navigate', { pageId, input }),
  goBack: (pageId) => invoke('page:go-back', { pageId }),
  goForward: (pageId) => invoke('page:go-forward', { pageId }),
  reload: (pageId) => invoke('page:reload', { pageId }),
  stop: (pageId) => invoke('page:stop', { pageId }),
  setCollapsed: (pageId, collapsed) =>
    invoke('page:set-collapsed', { pageId, collapsed }),
  setContentInsets: (insets) => send('view:set-content-insets', insets),
  focusPage: () => send('view:focus-page'),
  onSnapshot: (listener) => subscribe(eventChannels.snapshot, listener),
  onUiCommand: (listener) => subscribe(eventChannels.uiCommand, listener),
};

contextBridge.exposeInMainWorld('splash', api);
