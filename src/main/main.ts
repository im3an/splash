import { authenticationTarget } from './windows/auth-window';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  dialog,
  nativeTheme,
  session,
  webContents,
  type WebContents,
} from 'electron';
import { eventChannels } from '../shared/api';
import type { TaskList } from '../shared/types';
import { buildTaskList, type LivePage } from './browser/task-list';
import { keepOpenedFiles } from './browser/opened-files';
import {
  allowLocalFile,
  forgetLocalFiles,
  isNavigableUrl,
  localFileUrl,
  OPENABLE_FILE_FILTER,
} from './browser/url';
import { BrowsingDataCleaner } from './privacy/browsing-data';
import type { ContentBlocking } from './privacy/content-blocker';
import { enableContentBlocking } from './privacy/electron-content-blocker';
import { SettingsWindow } from './windows/settings-window';
import { registerIpc } from './ipc/register-ipc';
import { installApplicationMenu } from './menus/application-menu';
import {
  configureAppSession,
  configureWebSession,
  hardenAllWebContents,
  WEB_PARTITION,
} from './security/web-security';
import { SchemaTooNewError } from './storage/migrations';
import { openTrailStore, SqliteTrailStore } from './storage/sqlite-trail-store';
import type { TrailStore } from './storage/trail-store';
import { SessionPersister } from './storage/session-persister';
import { TrailWindow } from './windows/browser-window';
import { registerShellScheme, serveShell } from './windows/shell-url';
import { ExtensionHost } from './extensions/extension-host';
import { SharedTrails } from './browser/browser-controller';
import { contentsForPage, pageHandleFor } from './browser/electron-page-host';
import { PreferencesService } from './preferences';
import type { DownloadManager } from './downloads/download-manager';
import { createDownloadManager } from './downloads/electron-downloads';

app.setName('Splash');
registerShellScheme();
// Reproducible beta QA uses a separate profile and never touches daily
// browsing. Development builds only: an installed app ignores the variable.
const qaProfile = app.isPackaged ? undefined : process.env.SPLASH_USER_DATA_DIR;
if (qaProfile && path.isAbsolute(qaProfile)) app.setPath('userData', qaProfile);

const windows = new Set<TrailWindow>();
const trails = new SharedTrails();
let persister: SessionPersister;
let saveProblem: string | null = null;
let store: TrailStore;
let preferences: PreferencesService;
let downloads: DownloadManager;
let cleaner: BrowsingDataCleaner;
let blocker: ContentBlocking;
let extensions: ExtensionHost | null = null;
let settings: SettingsWindow | null = null;
/** Links macOS handed over before a window was ready. */
const pendingUrls: string[] = [];
/** Files macOS handed over before a window was ready. */
const pendingFiles: string[] = [];
let quitApproved = false;
let quitPending = false;

function openSettings(): void {
  if (settings && !settings.window.isDestroyed()) {
    settings.focus();
    return;
  }
  settings = new SettingsWindow({
    store,
    preferences,
    downloads,
    cleaner,
    blocker,
    browserWindow: () => currentWindow(),
  });
  settings.window.on('closed', () => {
    settings = null;
  });
}

/** Opens a web link from another app as a new page. */
function openExternalUrl(url: string): void {
  if (!isNavigableUrl(url)) return;
  const trailWindow = currentWindow() ?? openWindow();
  trailWindow.controller.createPage({ url });
  if (trailWindow.window.isMinimized()) trailWindow.window.restore();
  trailWindow.window.focus();
}

/** Opens a file the user picked, here or in the Finder, as a new page. */
function openLocalFile(file: string): void {
  const url = localFileUrl(file);
  if (!url) {
    void dialog.showMessageBox({
      type: 'warning',
      message: `Splash can’t show “${path.basename(file)}”.`,
      detail: 'It opens web pages, PDFs, images, text, audio and video.',
    });
    return;
  }
  allowLocalFile(url);
  const trailWindow = currentWindow() ?? openWindow();
  trailWindow.controller.createPage({ url });
  if (trailWindow.window.isMinimized()) trailWindow.window.restore();
  trailWindow.window.focus();
}

async function chooseFiles(): Promise<void> {
  const parent = currentWindow()?.window;
  const options = {
    title: 'Open File',
    filters: [OPENABLE_FILE_FILTER],
    properties: ['openFile', 'multiSelections'] as (
      | 'openFile'
      | 'multiSelections'
    )[],
  };
  try {
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (!canceled) filePaths.forEach(openLocalFile);
  } catch (error) {
    dialog.showErrorBox('The file couldn’t be opened', String(error));
  }
}

interface StartupStore {
  store: TrailStore;
  /** Something the user needs to know about their saved data. */
  notice: { message: string; detail: string } | null;
}

/**
 * Opens the saved session. Whatever goes wrong, Splash still starts: with a
 * fresh database when the old one was unreadable, or with a temporary
 * in-memory session that leaves the file untouched when it can't be used.
 */
function openStartupStore(): StartupStore {
  const file = path.join(app.getPath('userData'), 'splash.db');
  try {
    const { store: opened, recoveredFrom } = openTrailStore(file);
    return {
      store: opened,
      notice: recoveredFrom
        ? {
            message:
              'Splash couldn’t read your saved trails and started fresh.',
            detail: `The unreadable file was kept as ${recoveredFrom}.`,
          }
        : null,
    };
  } catch (error) {
    const temporary = new SqliteTrailStore(new DatabaseSync(':memory:'));
    const newer = error instanceof SchemaTooNewError;
    return {
      store: temporary,
      notice: {
        message: newer
          ? 'Your trails were saved by a newer version of Splash.'
          : 'Splash couldn’t open its saved trails.',
        detail: newer
          ? 'This version can’t open them, so it’s running a temporary session that won’t be saved. Your saved trails are untouched; open them with the newer version.'
          : `It’s running a temporary session that won’t be saved. Your saved trails are untouched. (${error instanceof Error ? error.message : String(error)})`,
      },
    };
  }
}

function refreshMenu(): void {
  installApplicationMenu({
    currentWindow,
    openWindow,
    openSettings,
    chooseFiles: () => void chooseFiles(),
    store,
    preferences,
  });
}

/** What every window has running, as the task manager shows it. */
function listTasks(): TaskList {
  const pages: LivePage[] = [];
  let asleep = 0;
  for (const trailWindow of windows) {
    const { live, asleep: sleeping } = trailWindow.controller.taskPages();
    // Every window counts the same shared trails.
    asleep = sleeping;
    for (const { id, ...page } of live) {
      const contents = contentsForPage(id);
      // A crashed page has no process, and no frames left to ask about.
      if (!contents || contents.isCrashed()) continue;
      pages.push({
        ...page,
        pageId: id,
        pid: contents.getOSProcessId(),
        framePids: contents.mainFrame.framesInSubtree.map(
          (frame) => frame.osProcessId,
        ),
      });
    }
  }
  const extensionPages = webContents
    .getAllWebContents()
    .filter((contents) => contents.getURL().startsWith('chrome-extension://'));
  return buildTaskList(
    app.getAppMetrics().map((process) => ({
      pid: process.pid,
      cpuPercent: process.cpu.percentCPUUsage,
      workingSetKb: process.memory.workingSetSize,
    })),
    pages,
    extensionPages.map((contents) => {
      const id = new URL(contents.getURL()).host;
      return {
        id,
        name: contents.session.extensions.getExtension(id)?.name ?? 'Extension',
        pid: contents.getOSProcessId(),
      };
    }),
    asleep,
  );
}

function openWindow(show?: { pageId: string } | { url: string }): TrailWindow {
  const beside = currentWindow()?.window.getNormalBounds();
  const trailWindow = new TrailWindow({
    trails,
    saves: {
      schedule: () => persister.schedule(),
      flush: () => persister.flush(),
      problem: () => saveProblem,
    },
    ...(beside
      ? { bounds: { ...beside, x: beside.x + 28, y: beside.y + 28 } }
      : {}),
    ...(show ? { show } : {}),
    openPageInNewWindow: (pageId) => void openWindow({ pageId }),
    store,
    preferences,
    downloads,
    blocker,
    extensions,
    onWorkspacesChanged: refreshMenu,
    openSettings,
    listTasks,
    onSnapshot: (snapshot) => settings?.send(eventChannels.snapshot, snapshot),
  });
  windows.add(trailWindow);
  // The Workspaces menu is built for one window, so rebuild it whenever
  // which window it should act on changes. A fresh start sends no snapshot,
  // and a closed window must not be left behind in the menu.
  trailWindow.window.on('focus', refreshMenu);
  trailWindow.window.on('closed', () => {
    windows.delete(trailWindow);
    refreshMenu();
  });
  refreshMenu();
  return trailWindow;
}

/** The window showing a page, with the page's id. */
function windowOfContents(
  contents: WebContents,
): { trailWindow: TrailWindow; pageId: string } | null {
  const pageId = pageHandleFor(contents)?.pageId;
  if (!pageId) return null;
  for (const trailWindow of windows) {
    if (trailWindow.controller.holds(pageId)) {
      return { trailWindow, pageId };
    }
  }
  return null;
}

/** Extensions open, show and close Splash pages in place of Chrome's tabs. */
function createExtensionHost(): ExtensionHost {
  return new ExtensionHost(session.fromPartition(WEB_PARTITION), {
    openPage: (url, active) => {
      const trailWindow = currentWindow() ?? openWindow();
      const pageId = trailWindow.controller.createPage({
        url,
        activate: active,
      });
      const contents = contentsForPage(pageId);
      return contents ? { contents, window: trailWindow.window } : null;
    },
    showPage: (contents) => {
      // Splash also tells extensions which page is in front, and the
      // library answers by asking to show it; that must not loop.
      if (contents.isDestroyed()) return;
      const found = windowOfContents(contents);
      if (!found) return;
      const { controller, window } = found.trailWindow;
      if (controller.activePageId === found.pageId) return;
      controller.activatePage(found.pageId);
      window.focus();
    },
    closePage: (contents) => {
      const found = windowOfContents(contents);
      found?.trailWindow.controller.closePage(found.pageId);
    },
    openWindow: (url) => openWindow(url ? { url } : undefined).window,
  });
}

function currentWindow(): TrailWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  for (const trailWindow of windows) {
    if (trailWindow.window === focused) return trailWindow;
  }
  return windows.values().next().value ?? null;
}

// A bug in one handler must not end in Electron's raw error dialog.
process.on('uncaughtException', (error) => {
  console.error('Unexpected error in the main process', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in the main process', reason);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  hardenAllWebContents();

  app.on('second-instance', () => {
    const trailWindow = currentWindow() ?? openWindow();
    if (trailWindow.window.isMinimized()) trailWindow.window.restore();
    trailWindow.window.focus();
  });

  // Links clicked in other apps once Splash is the default browser.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (app.isReady() && windows.size > 0) openExternalUrl(url);
    else pendingUrls.push(url);
  });

  // A file dropped on the Dock icon, or opened with Splash from the Finder.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (app.isReady() && windows.size > 0) openLocalFile(file);
    else pendingFiles.push(file);
  });

  registerIpc((sender) => {
    const auth = authenticationTarget(sender);
    if (auth) return auth;
    for (const trailWindow of windows) {
      if (trailWindow.window.webContents === sender) return trailWindow.ipc;
    }
    if (settings && !settings.window.isDestroyed()) {
      if (settings.window.webContents === sender) return settings.ipc;
    }
    return null;
  });

  void app.whenReady().then(async () => {
    const brandIcon = app.isPackaged
      ? path.join(process.resourcesPath, 'Splash.png')
      : path.join(app.getAppPath(), 'assets/macos/Splash.png');
    app.dock?.setIcon(brandIcon);
    app.setAboutPanelOptions({
      applicationName: 'Splash',
      applicationVersion: app.getVersion(),
      iconPath: brandIcon,
      credits: 'A trail-based browser for macOS',
      copyright: 'Licensed under GPL-3.0-only',
    });
    const startup = openStartupStore();
    store = startup.store;
    persister = new SessionPersister({
      store,
      exportSession: () => trails.lead!.exportSession(),
      isIdle: () => windows.size === 0,
      onError: (error) => {
        console.error('Could not save the session', error);
        saveProblem = error instanceof Error ? error.message : String(error);
        for (const trailWindow of windows) trailWindow.sendStorage();
      },
      onSaved: () => {
        if (saveProblem === null) return;
        saveProblem = null;
        for (const trailWindow of windows) trailWindow.sendStorage();
      },
    });
    // Before any window restores its pages, which may include opened files.
    keepOpenedFiles(store);
    configureAppSession(session.defaultSession);
    serveShell(session.defaultSession);
    configureWebSession(session.fromPartition(WEB_PARTITION), store);
    preferences = new PreferencesService(store);
    nativeTheme.themeSource = preferences.get().theme;
    blocker = enableContentBlocking(
      session.fromPartition(WEB_PARTITION),
      store,
      preferences,
    );
    downloads = createDownloadManager(
      session.fromPartition(WEB_PARTITION),
      store,
      preferences,
    );
    // Progress events are frequent; tell the shell at most every 200 ms.
    let downloadsTimer: ReturnType<typeof setTimeout> | null = null;
    downloads.onChange(() => {
      downloadsTimer ??= setTimeout(() => {
        downloadsTimer = null;
        for (const trailWindow of windows) trailWindow.sendDownloads();
        settings?.send(eventChannels.downloads, downloads.list());
        app.dock?.setBadge(
          downloads.activeCount > 0 ? String(downloads.activeCount) : '',
        );
      }, 200);
    });
    const webSession = session.fromPartition(WEB_PARTITION);
    cleaner = new BrowsingDataCleaner({
      store,
      clearSiteData: () =>
        webSession.clearStorageData({
          storages: [
            'cookies',
            'filesystem',
            'indexdb',
            'localstorage',
            'shadercache',
            'serviceworkers',
            'cachestorage',
          ],
        }),
      clearCache: () => webSession.clearCache(),
      clearDownloadList: () => downloads.clearFinished(),
      forgetClosedPages: () => {
        if (windows.size === 0) trails.lead?.forgetClosed();
        for (const trailWindow of windows)
          trailWindow.controller.forgetClosed();
        // A file that's no longer on any page leaves no trace of its path.
        forgetLocalFiles(
          [...windows].flatMap((trailWindow) =>
            trailWindow.controller
              .exportSession()
              .pages.flatMap((page) => [
                ...(page.url ? [page.url] : []),
                ...(page.history?.entries.map((entry) => entry.url) ?? []),
              ]),
          ),
        );
      },
      now: Date.now,
      createToken: randomUUID,
    });
    preferences.onChange((changed) => {
      for (const trailWindow of windows) trailWindow.applyPreferences(changed);
      settings?.send(eventChannels.preferences, changed);
      refreshMenu();
    });

    refreshMenu();
    try {
      extensions = createExtensionHost();
      // Before the first window, so restored pages open with uBlock Origin
      // already running.
      await extensions.loadBundled();
    } catch (error) {
      console.error('Extensions are unavailable', error);
    }
    const firstWindow = openWindow();
    const recoveryWarning = preferences.recoveryWarning();
    const notice =
      startup.notice ??
      (recoveryWarning
        ? {
            message: 'Some preferences needed recovery.',
            detail: recoveryWarning,
          }
        : null);
    if (notice) {
      const { message, detail } = notice;
      console.warn(`${message} ${detail}`);
      // Once the shell has loaded, so the sheet has a visible window to
      // attach to.
      firstWindow.window.webContents.once('did-finish-load', () => {
        void dialog.showMessageBox(firstWindow.window, {
          type: 'warning',
          message,
          detail,
        });
      });
    }

    for (const url of pendingUrls.splice(0)) openExternalUrl(url);
    for (const file of pendingFiles.splice(0)) openLocalFile(file);

    app.on('activate', () => {
      if (windows.size === 0) openWindow();
    });
  });

  app.on('before-quit', (event) => {
    if (quitApproved || windows.size === 0) return;
    event.preventDefault();
    if (quitPending) return;
    quitPending = true;
    void (async () => {
      for (const trailWindow of windows) {
        if (!(await trailWindow.confirmCloseWindow())) {
          for (const open of windows) open.resumeAfterCanceledClose();
          return;
        }
      }
      quitApproved = true;
      app.quit();
    })()
      .catch((error) => {
        for (const open of windows) open.resumeAfterCanceledClose();
        dialog.showErrorBox('Could not quit Splash', String(error));
      })
      .finally(() => {
        quitPending = false;
      });
  });

  app.on('will-quit', () => {
    persister?.dispose();
    store?.close();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
