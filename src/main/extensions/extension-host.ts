import path from 'node:path';
import {
  app,
  session as sessions,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItem,
  type Session,
  type WebContents,
} from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { allowExtensionPages, isPageUrl } from '../browser/url';

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
  }

  /** Loads the bundled extensions; one that fails doesn't stop the rest. */
  async loadBundled(): Promise<void> {
    for (const folder of BUNDLED) {
      try {
        const extension = await this.session.extensions.loadExtension(
          bundledPath(folder),
        );
        allowExtensionPages(extension.id);
      } catch (error) {
        console.error(`Could not load the ${folder} extension`, error);
      }
    }
  }

  /** Makes a page visible to extensions as a tab of `window`. */
  addPage(contents: WebContents, window: BrowserWindow): void {
    // The library watches each tab with a dozen listeners of its own.
    contents.setMaxListeners(Math.max(contents.getMaxListeners(), 30));
    this.extensions.addTab(contents, window);
  }

  /** Tells extensions which page is in front. */
  selectPage(contents: WebContents): void {
    this.extensions.selectTab(contents);
  }

  menuItems(contents: WebContents, params: ContextMenuParams): MenuItem[] {
    return this.extensions.getContextMenuItems(contents, params);
  }
}
