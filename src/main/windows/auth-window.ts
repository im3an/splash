import path from 'node:path';
import {
  BrowserWindow,
  nativeTheme,
  type AuthInfo,
  type BaseWindow,
  type WebContents,
} from 'electron';
import type { IpcTarget } from '../ipc/register-ipc';
import { DEFAULT_APPEARANCE, frameColor } from '../../shared/appearance';
import { isSameDocument, shellUrl } from './shell-url';

const targets = new Map<number, IpcTarget>();
const pending = new Map<number, () => void>();
export function authenticationTarget(sender: WebContents): IpcTarget | null {
  return targets.get(sender.id) ?? null;
}

/** One isolated, page-owned challenge. Secrets never enter a URL or saved state. */
export function requestAuthentication(
  parent: BaseWindow,
  page: WebContents,
  requestUrl: string,
  info: AuthInfo,
  callback: (username?: string, password?: string) => void,
): void {
  pending.get(page.id)?.();
  const url = `${shellUrl()}#authentication`;
  const prompt = new BrowserWindow({
    width: 440,
    height: 430,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: BrowserWindow.fromId(parent.id) ?? undefined,
    modal: true,
    show: false,
    title: 'Sign in to site',
    backgroundColor: frameColor(
      DEFAULT_APPEARANCE,
      nativeTheme.shouldUseDarkColors,
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const promptId = prompt.webContents.id;
  let finished = false;
  const finish = (
    credentials: { username: string; password: string } | null,
  ) => {
    if (finished) return;
    finished = true;
    pending.delete(page.id);
    targets.delete(promptId);
    page.removeListener('destroyed', cancel);
    page.removeListener('did-start-navigation', navigating);
    callback(credentials?.username, credentials?.password);
    if (!prompt.isDestroyed()) prompt.destroy();
  };
  const cancel = () => finish(null);
  const navigating = (details: {
    isMainFrame: boolean;
    isSameDocument: boolean;
  }) => {
    if (details.isMainFrame && !details.isSameDocument) cancel();
  };
  pending.set(page.id, cancel);
  page.once('destroyed', cancel);
  page.on('did-start-navigation', navigating);
  prompt.once('closed', cancel);
  const origin = new URL(requestUrl).origin;
  targets.set(promptId, {
    isShellUrl: (candidate) => isSameDocument(candidate, url),
    invoke: {
      'auth:challenge': () => ({
        origin,
        host: info.host,
        isProxy: info.isProxy,
        secure: requestUrl.startsWith('https:') && !info.isProxy,
      }),
      'auth:respond': (credentials) => {
        setImmediate(() => finish(credentials));
      },
    },
    send: {},
  });
  prompt.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  prompt.webContents.on('will-navigate', (event) => {
    if (!isSameDocument(event.url, url)) event.preventDefault();
  });
  prompt.once('ready-to-show', () => prompt.show());
  void prompt.loadURL(url).catch(cancel);
}
