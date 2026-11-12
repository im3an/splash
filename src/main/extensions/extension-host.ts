import path from 'node:path';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  session as sessions,
  webContents,
  type ContextMenuParams,
  type MenuItem,
  type Session,
  type WebContents,
} from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import {
  installChromeWebStore,
  uninstallExtension,
} from 'electron-chrome-web-store';
import type { ExtensionInfo, ExtensionSource } from '../../shared/types';
import { allowExtensionPages, isPageUrl } from '../browser/url';
import { isFromShell } from '../ipc/register-ipc';
import { onCrxRejected } from './crx-verify';
import { withGuardedExtensionIpc } from './extension-ipc-guard';
import {
  describeExtension,
  iconFile,
  loadProblem,
  parseDisabled,
  type DisabledExtensions,
} from './extension-info';
import {
  installPrompt,
  isWebStoreFrame,
  WEB_STORE_URL,
  type StoreManifest,
} from './web-store';

/** The parts of the library's internals `movePage` has to reach. */
interface ExtensionContext {
  store: {
    addWindow(window: BrowserWindow): void;
    tabToWindow: WeakMap<WebContents, BrowserWindow>;
  };
}

/** Extensions Splash ships with, by folder under `extensions/`. */
const BUNDLED = ['ublock-origin'];

/** The library's id for its preload, which Splash swaps for its own. */
const WEB_STORE_PRELOAD_ID = 'electron-chrome-web-store';

/** A store extension that won't start must not keep Splash from opening. */
const WEB_STORE_LOAD_LIMIT_MS = 5000;

/** What the library hands over before installing from the store. */
interface InstallRequest {
  localizedName: string;
  manifest: StoreManifest;
  icon: Electron.NativeImage;
  frame: { origin: string; parent: unknown };
  browserWindow?: BrowserWindow;
}

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

function iconDataUrl(extension: Electron.Extension): string | null {
  const file = iconFile(extension);
  if (!file) return null;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty()
    ? null
    : image.resize({ width: 64, height: 64 }).toDataURL();
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
  private readonly changeListeners = new Set<() => void>();
  private disabled: DisabledExtensions = {};
  /** Turning on and off moves folders, so one change happens at a time. */
  private changes: Promise<unknown> = Promise.resolve();
  /** What the user just agreed to add, until it loads or is refused. */
  private adding: string | null = null;

  constructor(
    private readonly session: Session,
    private readonly windows: ExtensionWindows,
  ) {
    // Every way in (bundled, unpacked, store, a store update) may show its
    // own pages.
    onCrxRejected((reason) => this.packageRefused(reason));
    session.extensions.on('extension-loaded', (_event, extension) => {
      allowExtensionPages(extension.id);
      this.adding = null;
      // Added again from the store while off: it's on now, and the copy that
      // was set aside is out of date.
      if (this.disabled[extension.id]) {
        delete this.disabled[extension.id];
        void this.inTurn(async () => {
          await rm(path.join(this.parkedPath, extension.id), {
            recursive: true,
            force: true,
          });
          await this.saveDisabled();
        }).catch(console.error);
      }
      this.changed();
    });
    session.extensions.on('extension-unloaded', () => this.changed());
    // Each chrome.* call must come from the extension it names (see
    // extension-ipc-guard.ts).
    const build = () =>
      new ElectronChromeExtensions({
        license: 'GPL-3.0',
        session,
        createTab: async (details) => {
          const url = details.url;
          if (!url || !isPageUrl(url)) {
            throw new Error(
              'Splash opens pages only for web or extension pages',
            );
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
    this.extensions = withGuardedExtensionIpc(
      ipcMain,
      { fromShell: isFromShell },
      build,
    );
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
    // Icons appear in the order extensions first spoke up, which differs from
    // launch to launch, so they'd swap places. Names keep them still.
    const keepIconsInOrder = () => this.sortToolbarIcons();
    session.extensions.on('extension-loaded', keepIconsInOrder);
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

  /** Extensions in the toolbar, alphabetically by name. */
  private sortToolbarIcons(): void {
    // The library keeps this to itself and offers no way to order it.
    const actions = (
      this.extensions as unknown as {
        api?: { browserAction?: { actionMap?: Map<string, unknown> } };
      }
    ).api?.browserAction?.actionMap;
    if (!actions) return;
    const nameOf = (id: string) =>
      this.session.extensions.getExtension(id)?.name ?? id;
    const sorted = [...actions].sort(([a], [b]) =>
      nameOf(a).localeCompare(nameOf(b)),
    );
    actions.clear();
    for (const [id, action] of sorted) actions.set(id, action);
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
    this.disabled = await readFile(this.disabledPath, 'utf8').then(
      parseDisabled,
      () => ({}),
    );
    const off = new Set(
      Object.values(this.disabled).map((item) => this.currentPath(item)),
    );
    for (const folder of [...BUNDLED.map(bundledPath), ...installed]) {
      if (off.has(folder)) continue;
      try {
        await this.session.extensions.loadExtension(folder);
      } catch (error) {
        console.error(`Could not load the ${folder} extension`, error);
      }
    }
    await this.recoverParked();
    await this.enableWebStore();
    this.sortToolbarIcons();
  }

  /**
   * A quit in the middle of turning one off can leave its folder set aside
   * with no row to bring it back. It wasn't marked off, so it goes home.
   */
  private async recoverParked(): Promise<void> {
    const parked = await readdir(this.parkedPath).catch(() => [] as string[]);
    for (const id of parked.filter((name) => !this.disabled[name])) {
      const folder = path.join(this.parkedPath, id);
      try {
        await mkdir(this.storePath, { recursive: true });
        await rename(folder, path.join(this.storePath, id));
      } catch {
        // A newer copy is already there; this one is out of date.
        await rm(folder, { recursive: true, force: true }).catch(console.error);
      }
    }
  }

  private get disabledPath(): string {
    return path.join(app.getPath('userData'), 'extensions-disabled.json');
  }

  /** Where extensions from the Chrome Web Store are unpacked. */
  private get storePath(): string {
    return path.join(app.getPath('userData'), 'Extensions');
  }

  /**
   * Where store extensions wait while off. The library loads and starts
   * everything in `storePath` and can't skip one, so off means moved out.
   */
  private get parkedPath(): string {
    return path.join(app.getPath('userData'), 'Extensions Off');
  }

  /** A bundled extension's folder moves when the app does. */
  private currentPath({ path: saved, info }: DisabledExtensions[string]) {
    return info.source === 'bundled'
      ? bundledPath(path.basename(saved))
      : saved;
  }

  private fromWebStore(extensionPath: string): boolean {
    return extensionPath.startsWith(this.storePath + path.sep);
  }

  /**
   * Lets the Chrome Web Store's Add button work, loads what it installed
   * before, and keeps those up to date. Nothing reaches Google for updates
   * until an extension has been added from the store.
   */
  private async enableWebStore(): Promise<void> {
    const loaded = installChromeWebStore({
      session: this.session,
      extensionsPath: this.storePath,
      beforeInstall: (request) =>
        this.confirmInstall(request as InstallRequest),
    });
    // The library registers its preload before its first await; replace it
    // with the one that checks the store's exact origin.
    if (
      this.session
        .getPreloadScripts()
        .some((script) => script.id === WEB_STORE_PRELOAD_ID)
    ) {
      this.session.unregisterPreloadScript(WEB_STORE_PRELOAD_ID);
    }
    this.session.registerPreloadScript({
      id: WEB_STORE_PRELOAD_ID,
      type: 'frame',
      filePath: path.join(__dirname, 'chrome-web-store.preload.js'),
    });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      loaded.catch((error: unknown) =>
        console.error('Could not load Chrome Web Store extensions', error),
      ),
      new Promise((resolve) => {
        timer = setTimeout(resolve, WEB_STORE_LOAD_LIMIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  private async confirmInstall(
    request: InstallRequest,
  ): Promise<{ action: 'allow' | 'deny' }> {
    if (!isWebStoreFrame(request.frame)) return { action: 'deny' };
    const options: Electron.MessageBoxOptions = {
      ...installPrompt(request.localizedName, request.manifest),
      // The store's icon can be a format macOS sheets can't draw.
      ...(request.icon.isEmpty() ? {} : { icon: request.icon }),
      buttons: ['Add Extension', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    };
    const parent = request.browserWindow ?? BrowserWindow.getFocusedWindow();
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response !== 0) return { action: 'deny' };
    this.adding = request.localizedName;
    return { action: 'allow' };
  }

  /**
   * A refused update just stays on the version it has, and is logged: a nag
   * every few hours wouldn't help. Someone waiting on an Add click is told.
   */
  private packageRefused(reason: string): void {
    console.error(`Refused an extension package: ${reason}`);
    const name = this.adding;
    if (!name) return;
    this.adding = null;
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      message: `Splash didn’t add “${name}”`,
      detail:
        'Its download couldn’t be verified as coming from the Chrome Web Store, so nothing was installed. If this keeps happening, something on your connection may be changing downloads.',
    };
    const parent = BrowserWindow.getFocusedWindow();
    void (parent
      ? dialog.showMessageBox(parent, options)
      : dialog.showMessageBox(options));
  }

  /** Everything Splash has, on or off, for the Extensions settings. */
  list(): ExtensionInfo[] {
    const loaded = this.session.extensions
      .getAllExtensions()
      .map((extension) =>
        describeExtension(
          extension,
          this.sourceOf(extension.path),
          iconDataUrl(extension),
        ),
      );
    const off = Object.values(this.disabled).map(({ info }) => ({
      ...info,
      enabled: false,
    }));
    return [...loaded, ...off].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Called whenever an extension comes, goes, or changes version. */
  onChange(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  private changed(): void {
    for (const listener of this.changeListeners) listener();
  }

  /** Every id with data worth keeping, including ones turned off. */
  knownIds(): string[] {
    return this.list().map((extension) => extension.id);
  }

  setEnabled(id: string, enabled: boolean): Promise<void> {
    return this.inTurn(() => (enabled ? this.turnOn(id) : this.turnOff(id)));
  }

  remove(id: string): Promise<void> {
    return this.inTurn(() => this.removeNow(id));
  }

  private inTurn(change: () => Promise<void>): Promise<void> {
    const next = this.changes.then(change, change);
    this.changes = next.catch(() => {});
    return next;
  }

  /** An extension that's gone leaves its pages dead, so they go first. */
  private closePagesOf(id: string): void {
    const origin = `chrome-extension://${id}/`;
    for (const contents of webContents.getAllWebContents()) {
      if (
        contents.session === this.session &&
        contents.getURL().startsWith(origin)
      ) {
        this.windows.closePage(contents);
      }
    }
  }

  private async turnOn(id: string): Promise<void> {
    const entry = this.disabled[id];
    if (!entry) return;
    const store = entry.info.source === 'store';
    const parked = path.join(this.parkedPath, id);
    const home = path.join(this.storePath, id);
    if (store) await rename(parked, home);
    try {
      await this.session.extensions.loadExtension(
        store
          ? path.join(home, path.relative(parked, entry.path))
          : this.currentPath(entry),
      );
    } catch (error) {
      if (store) await rename(home, parked);
      throw error;
    }
    // The `extension-loaded` handler forgets it was off.
    await this.saveInstalled();
  }

  private async turnOff(id: string): Promise<void> {
    const extension = this.session.extensions.getExtension(id);
    if (!extension) return;
    const source = this.sourceOf(extension.path);
    const home = path.join(this.storePath, id);
    const parked = path.join(this.parkedPath, id);
    const info = describeExtension(extension, source, iconDataUrl(extension));
    this.closePagesOf(id);
    this.session.extensions.removeExtension(id);
    // Written before the folder moves, so a quit in between can't lose it.
    this.disabled[id] = {
      path:
        source === 'store'
          ? path.join(parked, path.relative(home, extension.path))
          : extension.path,
      info,
    };
    await Promise.all([this.saveDisabled(), this.saveInstalled()]);
    try {
      if (source === 'store') {
        await mkdir(this.parkedPath, { recursive: true });
        await rm(parked, { recursive: true, force: true });
        await rename(home, parked);
      }
    } catch (error) {
      await this.session.extensions.loadExtension(extension.path);
      throw error;
    }
    this.changed();
  }

  private async removeNow(id: string): Promise<void> {
    const entry = this.disabled[id];
    const extensionPath =
      this.session.extensions.getExtension(id)?.path ?? entry?.path;
    if (!extensionPath) return;
    const source = entry?.info.source ?? this.sourceOf(extensionPath);
    if (source === 'bundled') {
      throw new Error(
        'Extensions that come with Splash can only be turned off',
      );
    }
    this.closePagesOf(id);
    if (source === 'store') {
      // Its files too, or it would come back at the next launch.
      await uninstallExtension(id, {
        session: this.session,
        extensionsPath: this.storePath,
      });
      await rm(path.join(this.parkedPath, id), {
        recursive: true,
        force: true,
      });
    } else if (this.session.extensions.getExtension(id)) {
      this.session.extensions.removeExtension(id);
    }
    delete this.disabled[id];
    await Promise.all([this.saveDisabled(), this.saveInstalled()]);
    this.changed();
  }

  openWebStore(): void {
    this.openPage(WEB_STORE_URL);
  }

  /** An extension's options or store listing, in the browser window. */
  openPage(url: string): void {
    if (!isPageUrl(url)) throw new Error('Splash can’t open that address');
    const opened = this.windows.openPage(url, true);
    if (!opened) throw new Error('No window to open the page in');
    opened.window.show();
    opened.window.focus();
  }

  /** Asks for a folder and loads it; says why if it can't be. */
  async loadUnpacked(window: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose an unpacked Chrome extension',
      properties: ['openDirectory'],
      message:
        'Choose a folder containing manifest.json. Extensions can read and change the sites allowed by their permissions. Only load extensions you trust.',
    });
    const folder = result.filePaths[0];
    if (result.canceled || !folder) return null;
    try {
      await this.session.extensions.loadExtension(folder);
      await this.saveInstalled();
      this.changed();
      return null;
    } catch (error) {
      return loadProblem(error);
    }
  }

  private sourceOf(extensionPath: string): ExtensionSource {
    if (this.fromWebStore(extensionPath)) return 'store';
    return BUNDLED.some((folder) => extensionPath === bundledPath(folder))
      ? 'bundled'
      : 'unpacked';
  }

  private async saveDisabled(): Promise<void> {
    await writeFile(this.disabledPath, JSON.stringify(this.disabled), 'utf8');
  }

  private async saveInstalled(): Promise<void> {
    const paths = this.session.extensions
      .getAllExtensions()
      .map((extension) => extension.path)
      .filter(
        (extensionPath) =>
          !this.fromWebStore(extensionPath) &&
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
