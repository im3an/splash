import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, nativeTheme, session } from 'electron';
import { eventChannels } from '../../shared/api';
import type { ContentInsets, UiCommand } from '../../shared/types';
import { BrowserController } from '../browser/browser-controller';
import { createElectronPageHostFactory } from '../browser/electron-page-host';
import { contentBounds } from '../browser/layout';
import type { IpcTarget } from '../ipc/register-ipc';
import { WEB_PARTITION } from '../security/web-security';

/** Must match `--color-chrome` in the renderer's design tokens. */
const CHROME_BACKGROUND = { light: '#f3efe9', dark: '#1c1c1e' };

function chromeBackground(): string {
  return nativeTheme.shouldUseDarkColors
    ? CHROME_BACKGROUND.dark
    : CHROME_BACKGROUND.light;
}

function shellUrl(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const file = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  return pathToFileURL(file).href;
}

function isSameDocument(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    return b.protocol === 'file:'
      ? a.protocol === 'file:' && a.pathname === b.pathname
      : a.origin === b.origin;
  } catch {
    return false;
  }
}

/**
 * One browser window: the shell UI in the window's own WebContents, and the
 * page views managed by its `BrowserController` layered above it.
 */
export class TrailWindow {
  readonly window: BrowserWindow;
  readonly controller: BrowserController;
  readonly ipc: IpcTarget;
  private insets: ContentInsets | null = null;

  constructor() {
    const url = shellUrl();

    this.window = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: 'Splash',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: chromeBackground(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });

    this.controller = new BrowserController({
      createHost: createElectronPageHostFactory(
        this.window,
        session.fromPartition(WEB_PARTITION),
      ),
      onSnapshot: (snapshot) => this.send(eventChannels.snapshot, snapshot),
    });

    this.ipc = {
      isShellUrl: (candidate) => isSameDocument(candidate, url),
      invoke: {
        'browser:get-snapshot': () => this.controller.snapshot(),
        'page:create': ({ input }) => this.controller.createPage({ input }),
        'page:activate': ({ pageId }) => this.controller.activatePage(pageId),
        'page:close': ({ pageId }) => this.controller.closePage(pageId),
        'page:navigate': ({ pageId, input }) =>
          this.controller.navigate(pageId, input),
        'page:go-back': ({ pageId }) => this.controller.goBack(pageId),
        'page:go-forward': ({ pageId }) => this.controller.goForward(pageId),
        'page:reload': ({ pageId }) => this.controller.reload(pageId),
        'page:stop': ({ pageId }) => this.controller.stop(pageId),
        'page:set-collapsed': ({ pageId, collapsed }) =>
          this.controller.setCollapsed(pageId, collapsed),
      },
      send: {
        'view:set-content-insets': (insets) => {
          this.insets = insets;
          this.layout();
        },
        'view:focus-page': () => this.controller.focusActivePage(),
      },
    };

    this.lockShellNavigation(url);

    const syncBackground = () =>
      this.window.setBackgroundColor(chromeBackground());
    nativeTheme.on('updated', syncBackground);

    // Recompute in the main process so the page tracks live resizing
    // without waiting for a round trip through the shell UI.
    this.window.on('resize', () => this.layout());
    this.window.once('ready-to-show', () => this.window.show());
    this.window.on('closed', () => {
      nativeTheme.off('updated', syncBackground);
      this.controller.dispose();
    });

    void this.window.loadURL(url);
  }

  sendUiCommand(command: UiCommand): void {
    this.window.webContents.focus();
    this.send(eventChannels.uiCommand, command);
  }

  private layout(): void {
    if (!this.insets || this.window.isDestroyed()) return;
    const [width = 0, height = 0] = this.window.getContentSize();
    this.controller.setContentBounds(
      contentBounds({ width, height }, this.insets),
    );
  }

  private send(channel: string, payload: unknown): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }

  /** The shell UI never navigates away from itself or opens windows. */
  private lockShellNavigation(url: string): void {
    const contents = this.window.webContents;
    contents.on('will-navigate', (event) => {
      if (!isSameDocument(event.url, url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
}
