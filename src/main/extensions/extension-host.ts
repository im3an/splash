import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  app,
  Menu,
  dialog,
  session as sessions,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItem,
  type Session,
  type WebContents,
} from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { allowExtensionPages, isPageUrl } from '../browser/url';

/** The parts of the library's internals `movePage` has to reach. */
interface ExtensionContext {
  store: {
    addWindow(window: BrowserWindow): void;
    tabToWindow: WeakMap<WebContents, BrowserWindow>;
  };
}

/** Extensions Splash ships with, by folder under `extensions/`. */
const BUNDLED = ['ublock-origin'];

/** How extensions reach Splash's pages and windows. */
export interface ExtensionWindows {
  /** Opens a page in the current window; its contents, once it has them. */
  openPage(
    url: string,
    active: boolean,
  ): { contents: WebContents; window: BrowserWindow } | null;
  showPage(contents: WebContents): void;
  closePage(contents: WebContents): void;
  openWindow(url: string | undefined): BrowserWindow;
}

function bundledPath(folder: string): string {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(root, 'extensions', folder);
}

/**
 * Chrome extensions in the web session. Electron runs them; the
 * electron-chrome-extensions library adds the APIs Electron lacks, with
 * Splash's pages standing in for Chrome's tabs.
 */
export class ExtensionHost {
  private readonly extensions: ElectronChromeExtensions;

  constructor(
    private readonly session: Session,
    windows: ExtensionWindows,
  ) {
    this.extensions = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session,
      createTab: async (details) => {
        const url = details.url;
        if (!url || !isPageUrl(url)) {
          throw new Error('Splash opens pages only for web or extension pages');
        }
        const opened = windows.openPage(url, details.active ?? true);
        if (!opened) throw new Error('No window to open the page in');
        return [opened.contents, opened.window];
      },
      selectTab: (contents) => windows.showPage(contents),
      removeTab: (contents) => windows.closePage(contents),
      createWindow: async (details) => {
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        return windows.openWindow(url && isPageUrl(url) ? url : undefined);
      },
    });
    // The library registers its preload from node_modules; Splash ships its
    // own build of it with a fix for Electron 45 (see extension-preload.ts).
    for (const id of ['crx-mv2-preload', 'crx-mv3-preload']) {
      if (session.getPreloadScripts().some((script) => script.id === id)) {
        session.unregisterPreloadScript(id);
      }
    }
    const filePath = path.join(__dirname, 'chrome-extension-api.preload.js');
    session.registerPreloadScript({ type: 'frame', filePath });
    session.registerPreloadScript({ type: 'service-worker', filePath });
    // Toolbar icons are drawn in the shell, which lives in the default session.
    ElectronChromeExtensions.handleCRXProtocol(sessions.defaultSession);
    // The library adds a `destroyed` listener to a background page for every
    // chrome.* event it subscribes to; uBlock subscribes to more than ten.
    app.on('web-contents-created', (_event, contents) => {
      if (
        contents.session === session &&
        contents.getType() === 'backgroundPage'
      ) {
        contents.setMaxListeners(Math.max(contents.getMaxListeners(), 50));
      }
    });
  }

  /** Loads the bundled extensions; one that fails doesn't stop the rest. */
  async loadBundled(): Promise<void> {
    let installed: string[] = [];
    try {
      const saved: unknown = JSON.parse(
        await readFile(
          path.join(app.getPath('userData'), 'extensions.json'),
          'utf8',
        ),
      );
      if (Array.isArray(saved))
        installed = saved.filter(
          (item): item is string =>
            typeof item === 'string' && path.isAbsolute(item),
        );
    } catch {
      /* No user extensions installed yet. */
    }
    for (const folder of [...BUNDLED.map(bundledPath), ...installed]) {
      try {
        const extension = await this.session.extensions.loadExtension(folder);
        allowExtensionPages(extension.id);
      } catch (error) {
        console.error(`Could not load the ${folder} extension`, error);
      }
    }
  }

  async manage(window: BrowserWindow): Promise<void> {
    const extensions = this.session.extensions.getAllExtensions();
    Menu.buildFromTemplate([
      { label: 'Extensions', enabled: false },
      ...extensions.map((extension) => ({
        label: extension.name,
        submenu: [
          { label: `Version ${extension.version}`, enabled: false },
          {
            label: 'Remove Extension',
            enabled: !BUNDLED.some(
              (folder) => extension.path === bundledPath(folder),
            ),
            click: () => {
              this.session.extensions.removeExtension(extension.id);
              void this.saveInstalled().catch((error) =>
                dialog.showErrorBox('Could not save extensions', String(error)),
              );
            },
          },
        ],
      })),
      { type: 'separator' as const },
      {
        label: 'Load Unpacked Extension…',
        click: () => {
          void (async () => {
            const result = await dialog.showOpenDialog(window, {
              title: 'Choose an unpacked Chrome extension',
              properties: ['openDirectory'],
              message:
                'Choose a folder containing manifest.json. Extensions can read and change the sites allowed by their permissions. Only load extensions you trust.',
            });
            if (result.canceled || !result.filePaths[0]) return;
            const extension = await this.session.extensions.loadExtension(
              result.filePaths[0],
            );
            allowExtensionPages(extension.id);
            await this.saveInstalled();
          })().catch((error) =>
            dialog.showErrorBox('Could not load extension', String(error)),
          );
        },
      },
      {
        label:
          'Supports unpacked extensions; some Chrome APIs are unavailable.',
        enabled: false,
      },
    ]).popup({ window });
  }

  private async saveInstalled(): Promise<void> {
    const paths = this.session.extensions
      .getAllExtensions()
      .map((extension) => extension.path)
      .filter(
        (extensionPath) =>
          !BUNDLED.some((folder) => extensionPath === bundledPath(folder)),
      );
    await writeFile(
      path.join(app.getPath('userData'), 'extensions.json'),
      JSON.stringify(paths),
      'utf8',
    );
  }

  /** Makes a page visible to extensions as a tab of `window`. */
  addPage(contents: WebContents, window: BrowserWindow): void {
    // The library watches each tab with a dozen listeners of its own.
    contents.setMaxListeners(Math.max(contents.getMaxListeners(), 30));
    this.extensions.addTab(contents, window);
  }

  /**
   * A page moved to another window, so a toolbar popup opens over the right
   * one. The library has no call for this: its `removeTab` runs our close-page
   * hook, and adding the tab again doubles its listeners.
   */
  movePage(contents: WebContents, window: BrowserWindow): void {
    const { store } = (this.extensions as unknown as { ctx: ExtensionContext })
      .ctx;
    store.addWindow(window);
    store.tabToWindow.set(contents, window);
  }

  /** Tells extensions which page is in front. */
  selectPage(contents: WebContents): void {
    this.extensions.selectTab(contents);
  }

  menuItems(contents: WebContents, params: ContextMenuParams): MenuItem[] {
    return this.extensions.getContextMenuItems(contents, params);
  }
}
