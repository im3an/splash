import { authenticationTarget } from './windows/auth-window';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  safeStorage,
  session,
  shell,
  systemPreferences,
  webContents,
  type BaseWindow,
  type Rectangle,
  type Session,
  type WebContents,
} from 'electron';
import { eventChannels } from '../shared/api';
import type { TaskList } from '../shared/types';
import { Transfer } from './transfer/transfer';
import { bridgeFormAssist } from './vault/electron-form-assist';
import { FormAssist } from './vault/form-assist';
import { generatePassword, Vault, type Cipher } from './vault/vault';
import { AutofillMenu } from './windows/autofill-window';
import { isHelperGone } from './extensions/native-helper';
import {
  openPrivateProfile,
  type PrivateProfile,
} from './browser/private-profile';
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
import { CookieViewer, type CookieJar } from './privacy/cookies';
import { QuitClear } from './privacy/quit-clear';
import {
  enableContentBlocking,
  type ContentBlockingHost,
} from './privacy/electron-content-blocker';
import { createSiteRules } from './privacy/electron-site-rules';
import { SettingsWindow } from './windows/settings-window';
import { registerIpc } from './ipc/register-ipc';
import { installApplicationMenu } from './menus/application-menu';
import { dockMenuTemplate } from './menus/dock-menu';
import {
  configureAppSession,
  configureWebSession,
  hardenAllWebContents,
  WEB_PARTITION,
} from './security/web-security';
import {
  CertificateExceptions,
  hasCertificateException,
  type CertificateStore,
} from './security/certificate-exceptions';
import { requiresValidHttps } from './security/strict-https';
import { canContinuePastCertificateError } from '../shared/certificate-errors';
import { chooseClientCertificate } from './security/client-certificates';
import { createThreatList } from './security/electron-threat-list';
import type { ThreatList } from './security/threat-list';
import { SchemaTooNewError } from './storage/migrations';
import { openTrailStore, SqliteTrailStore } from './storage/sqlite-trail-store';
import type { TrailStore } from './storage/trail-store';
import { SessionPersister } from './storage/session-persister';
import { TrailWindow, visibleBounds } from './windows/browser-window';
import { registerShellScheme, serveShell } from './windows/shell-url';
import { ExtensionHost } from './extensions/extension-host';
import { SharedTrails } from './browser/browser-controller';
import { contentsForPage, pageHandleFor } from './browser/electron-page-host';
import { PreferencesService } from './preferences';
import { keepSpelling } from './spelling';
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
let cookies: CookieViewer;
let threats: ThreatList;
let quitClear: QuitClear | null = null;
let quitClearDone = false;
let blocker: ContentBlockingHost;
let vault: Vault;
let transfer: Transfer;
let formAssist: FormAssist;
let autofillMenu: AutofillMenu;
/** Private windows open now, which share one throwaway profile. */
let privateProfile: PrivateProfile | null = null;
let extensions: ExtensionHost | null = null;
let settings: SettingsWindow | null = null;
/** Links macOS handed over before a window was ready. */
const pendingUrls: string[] = [];
/** Files macOS handed over before a window was ready. */
const pendingFiles: string[] = [];
let quitApproved = false;
let quitPending = false;

/** Development builds run unattended by way of these; an installed app ignores them. */
const qaSkipsDeviceAuth =
  !app.isPackaged && process.env.SPLASH_QA_SKIP_DEVICE_AUTH === '1';

/**
 * Saved secrets are sealed with a key the Keychain holds. A test build must not
 * use the real item, which belongs to the installed app and would prompt.
 */
const cipher: Cipher = qaSkipsDeviceAuth
  ? {
      available: () => true,
      seal: (text) => Buffer.from(`qa:${text}`),
      open: (sealed) => Buffer.from(sealed).toString().slice(3),
    }
  : {
      available: () => safeStorage.isEncryptionAvailable(),
      seal: (text) => safeStorage.encryptString(text),
      open: (sealed) => safeStorage.decryptString(Buffer.from(sealed)),
    };

/** Touch ID, or a plain question on a Mac that can't offer it right now. */
async function authorize(reason: string): Promise<boolean> {
  if (qaSkipsDeviceAuth) return true;
  if (systemPreferences.canPromptTouchID()) {
    try {
      await systemPreferences.promptTouchID(reason);
      return true;
    } catch {
      return false;
    }
  }
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `Allow Splash to ${reason}?`,
    detail:
      'Touch ID isn’t available right now, so anyone at this Mac can answer.',
    buttons: ['Cancel', 'Allow'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

function openSettings(section?: string): void {
  if (settings && !settings.window.isDestroyed()) {
    settings.focus();
    if (section) settings.showSection(section);
    return;
  }
  settings = new SettingsWindow({
    vault,
    transfer,
    authorize,
    store,
    preferences,
    downloads,
    cleaner,
    blocker,
    cookies,
    webSession: session.fromPartition(WEB_PARTITION),
    threats,
    extensions: () => extensions,
    browserWindow: () => regularWindow(),
  });
  if (section) settings.showSection(section);
  settings.window.on('closed', () => {
    settings = null;
  });
}

/** Opens a web link from another app as a new page. */
function openExternalUrl(url: string): void {
  if (!isNavigableUrl(url)) return;
  const trailWindow = regularWindow() ?? openWindow();
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
  const trailWindow = regularWindow() ?? openWindow();
  trailWindow.controller.createPage({ url });
  if (trailWindow.window.isMinimized()) trailWindow.window.restore();
  trailWindow.window.focus();
}

/** Files dragged from the Finder onto a window open there, as new pages. */
function openDroppedFiles(trailWindow: TrailWindow, files: string[]): void {
  for (const file of files) {
    const url = localFileUrl(file);
    if (!url) {
      trailWindow.notify({
        kind: 'cannot-open-file',
        filename: path.basename(file),
      });
      continue;
    }
    allowLocalFile(url, { remember: !trailWindow.isPrivate });
    trailWindow.controller.createPage({ url });
  }
}

async function chooseFiles(): Promise<void> {
  const target = currentWindow();
  const parent = target?.window;
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
    if (canceled) return;
    if (target) openDroppedFiles(target, filePaths);
    else filePaths.forEach(openLocalFile);
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

/** Recently closed pages in the saved session, with no window to ask. */
function forgetSavedClosedPages(): void {
  const saved = store.loadSession();
  if (!saved) return;
  store.saveSession({ ...saved, closed: [] });
  forgetLocalFiles(
    saved.pages.flatMap((page) => [
      ...(page.url ? [page.url] : []),
      ...(page.history?.entries.map((entry) => entry.url) ?? []),
    ]),
  );
}

function refreshMenu(): void {
  installApplicationMenu({
    currentWindow,
    openWindow,
    openSettings: () => openSettings(),
    openImport: () => openSettings('transfer'),
    openPrivateWindow,
    chooseFiles: () => void chooseFiles(),
    // The History menu lists what the window in front has been to.
    store: currentWindow()?.store ?? store,
    preferences,
  });
  // A click in the Dock menu doesn't bring the app forward by itself.
  app.dock?.setMenu(
    Menu.buildFromTemplate(
      dockMenuTemplate({
        store,
        newWindow: () => {
          openWindow();
          app.focus({ steal: true });
        },
        openPage: (url) => {
          openExternalUrl(url);
          app.focus({ steal: true });
        },
      }),
    ),
  );
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

/** What every browser window is told, whichever profile it's in. */
function windowActions(trailWindow: () => TrailWindow) {
  return {
    onWorkspacesChanged: refreshMenu,
    openSettings: () => openSettings(),
    openSettingsSection: openSettings,
    openPrivateWindow,
    chooseFiles: () => void chooseFiles(),
    openFiles: (files: string[]) => openDroppedFiles(trailWindow(), files),
    answerCredentialPrompt: (
      id: string,
      answer: 'save' | 'never' | 'dismiss',
    ) => formAssist.answer(id, answer),
    listTasks,
  };
}

function openWindow(
  show?: { pageId: string } | { url: string },
  at?: Rectangle,
): TrailWindow {
  const beside = currentWindow()?.window.getNormalBounds();
  const trailWindow: TrailWindow = new TrailWindow({
    certificates,
    webSession: session.fromPartition(WEB_PARTITION),
    isPrivate: false,
    trails,
    saves: {
      schedule: () => persister.schedule(),
      flush: () => persister.flush(),
      problem: () => saveProblem,
    },
    ...(at
      ? { bounds: at }
      : beside
        ? { bounds: { ...beside, x: beside.x + 28, y: beside.y + 28 } }
        : {}),
    ...(show ? { show } : {}),
    openPageInNewWindow: (pageId) => void openWindow({ pageId }),
    store,
    preferences,
    downloads,
    blocker,
    cookies,
    extensions,
    ...windowActions(() => trailWindow),
    onSnapshot: (snapshot) => settings?.send(eventChannels.snapshot, snapshot),
  });
  trackWindow(trailWindow);
  return trailWindow;
}

/** Opens a window whose pages leave nothing behind when the last one closes. */
function openPrivateWindow(show?: { pageId: string }): TrailWindow {
  const profile = (privateProfile ??= openPrivateProfile({
    store,
    preferences,
    threats,
    blocker,
    onDownloads: () => {
      for (const open of windows) if (open.isPrivate) open.sendDownloads();
    },
  }));
  const isFirst = profile.windows === 0;
  profile.windows++;
  const beside = currentWindow()?.window.getNormalBounds();
  const trailWindow: TrailWindow = new TrailWindow({
    certificates,
    webSession: profile.session,
    isPrivate: true,
    trails: profile.trails,
    saves: { schedule() {}, flush: () => true, problem: () => null },
    ...(beside
      ? { bounds: { ...beside, x: beside.x + 28, y: beside.y + 28 } }
      : {}),
    ...(show ? { show } : {}),
    openPageInNewWindow: (pageId) => void openPrivateWindow({ pageId }),
    store: profile.store,
    preferences,
    downloads: profile.downloads,
    blocker,
    cookies: profile.cookies,
    extensions: null,
    ...windowActions(() => trailWindow),
  });
  if (isFirst) profile.nameWorkspace(trailWindow.controller);
  trailWindow.window.on('closed', () => {
    profile.windows--;
    if (profile.windows > 0) return;
    if (privateProfile === profile) privateProfile = null;
    void profile.discard();
  });
  trackWindow(trailWindow);
  return trailWindow;
}

/** The window for what comes from outside a window; never a private one. */
function regularWindow(): TrailWindow | null {
  const current = currentWindow();
  if (current && !current.isPrivate) return current;
  for (const trailWindow of windows) {
    if (!trailWindow.isPrivate) return trailWindow;
  }
  return null;
}

function regularWindowCount(): number {
  return [...windows].filter((trailWindow) => !trailWindow.isPrivate).length;
}

const OPEN_WINDOWS_KEY = 'windows.open';

interface OpenWindow {
  bounds: Rectangle;
  pageId: string | null;
}

/** Where each window is and what it shows, so a restart can bring them back. */
function rememberOpenWindows(): void {
  const lead = trails.lead;
  const open: OpenWindow[] = [...windows]
    .filter((trailWindow) => !trailWindow.isPrivate)
    .sort(
      (a, b) => Number(b.controller === lead) - Number(a.controller === lead),
    )
    .map((trailWindow) => ({
      bounds: trailWindow.window.getNormalBounds(),
      pageId: trailWindow.controller.activePageId,
    }));
  try {
    store.setPreference(OPEN_WINDOWS_KEY, JSON.stringify(open));
  } catch (error) {
    console.error('Could not save which windows are open', error);
  }
}

function savedOpenWindows(): OpenWindow[] {
  try {
    const saved: unknown = JSON.parse(
      store.getPreference(OPEN_WINDOWS_KEY) ?? '[]',
    );
    return Array.isArray(saved) ? (saved as OpenWindow[]) : [];
  } catch {
    return [];
  }
}

/** The first window, then any others that were open when Splash last quit. */
function openStartupWindows(): TrailWindow {
  const saved =
    preferences.get().startup === 'restore' ? savedOpenWindows() : [];
  const fits = (entry?: OpenWindow) =>
    entry?.bounds ? (visibleBounds(entry.bounds) ?? undefined) : undefined;
  const first = openWindow(undefined, fits(saved[0]));
  for (const entry of saved.slice(1)) {
    if (entry?.pageId && first.controller.hasPage(entry.pageId)) {
      openWindow({ pageId: entry.pageId }, fits(entry));
    }
  }
  return first;
}

function trackWindow(trailWindow: TrailWindow): void {
  windows.add(trailWindow);
  trailWindow.window.on('close', () => {
    if (!trailWindow.isPrivate && !quitApproved) rememberOpenWindows();
  });
  // The Workspaces menu is built for one window, so rebuild it whenever
  // which window it should act on changes. A fresh start sends no snapshot,
  // and a closed window must not be left behind in the menu.
  trailWindow.window.on('focus', refreshMenu);
  trailWindow.window.on('closed', () => {
    windows.delete(trailWindow);
    if (!trailWindow.isPrivate && !quitApproved) rememberOpenWindows();
    refreshMenu();
  });
  refreshMenu();
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
      const trailWindow = regularWindow() ?? openWindow();
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

const certificates = new CertificateExceptions();

/** Where a session's certificate choices live; none for anything but pages. */
function certificateStores(from?: Session): CertificateStore[] {
  const open = privateProfile ? [privateProfile.store] : [];
  if (!from) return [...open, store];
  if (from === session.fromPartition(WEB_PARTITION)) return [store];
  return from === privateProfile?.session ? [...open, store] : [];
}

function currentWindow(): TrailWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  for (const trailWindow of windows) {
    if (trailWindow.window === focused) return trailWindow;
  }
  return windows.values().next().value ?? null;
}

// A bug in one handler must not end in Electron's raw error dialog.
let lastHelperNotice = 0;
process.on('uncaughtException', (error) => {
  // A password manager's helper app quit, or never really started. The library
  // that talks to it can't catch this itself, and it isn't a fault in Splash.
  if (isHelperGone(error)) {
    console.warn('An extension’s native helper ended');
    if (Date.now() - lastHelperNotice > 60_000) {
      lastHelperNotice = Date.now();
      currentWindow()?.notify({
        kind: 'helper-ended',
        extension: 'An extension',
      });
    }
    return;
  }
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
    const trailWindow = regularWindow() ?? openWindow();
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

  // A certificate Chromium won't trust is refused, unless the user already
  // chose to use the site with exactly this one.
  app.on(
    'certificate-error',
    (event, contents, url, error, certificate, callback) => {
      const stores = certificateStores(contents.session);
      if (stores.length === 0 || !canContinuePastCertificateError(error)) {
        return;
      }
      event.preventDefault();
      const { fingerprint } = certificate;
      if (certificates.decide(stores, url, error, fingerprint)) {
        callback(true);
        return;
      }
      void requiresValidHttps(contents.session, new URL(url).hostname)
        .catch(() => true)
        .then((strict) => {
          certificates.refuse(url, fingerprint, strict);
          callback(false);
        });
    },
  );

  // Electron would otherwise send the first certificate that fits, unasked.
  app.on(
    'select-client-certificate',
    (event, contents, url, certificates, callback) => {
      event.preventDefault();
      // Only a page the user is looking at can ask them.
      if (!contents || contents.getType() === 'backgroundPage') {
        callback();
        return;
      }
      void chooseClientCertificate(url, certificates, async (prompt) => {
        const options = {
          type: 'question' as const,
          message: prompt.message,
          detail: prompt.detail,
          buttons: prompt.buttons,
          cancelId: prompt.cancelId,
          defaultId: prompt.cancelId,
          noLink: true,
        };
        const parent = currentWindow()?.window;
        const { response } = parent
          ? await dialog.showMessageBox(parent, options)
          : await dialog.showMessageBox(options);
        return response;
      }).then((certificate) => callback(certificate));
    },
  );

  registerIpc((sender) => {
    const auth = authenticationTarget(sender);
    if (auth) return auth;
    if (autofillMenu?.owns(sender)) return autofillMenu.ipc;
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
      isIdle: () => regularWindowCount() === 0,
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
    keepSpelling(
      preferences,
      session.fromPartition(WEB_PARTITION),
      systemPreferences,
    );
    nativeTheme.themeSource = preferences.get().theme;
    threats = createThreatList(preferences);
    const siteRules = createSiteRules(
      session.fromPartition(WEB_PARTITION),
      store,
      preferences,
      threats,
    );
    blocker = enableContentBlocking(
      session.fromPartition(WEB_PARTITION),
      store,
      preferences,
      siteRules,
    );
    downloads = createDownloadManager(
      session.fromPartition(WEB_PARTITION),
      store,
      preferences,
    );
    vault = new Vault({
      store,
      cipher,
      createId: randomUUID,
      now: Date.now,
    });
    transfer = new Transfer({
      // A test build can be pointed at made-up browser profiles.
      home:
        (!app.isPackaged && process.env.SPLASH_QA_HOME) || app.getPath('home'),
      scratch: app.getPath('temp'),
      store,
      preferences,
      vault,
      createId: randomUUID,
      trash: (file) => shell.trashItem(file),
    });
    let menuPlace: { parent: BaseWindow; anchor: Rectangle } | null = null;
    autofillMenu = new AutofillMenu({
      choose: (id) => formAssist.choose(id),
      lost: () => formAssist.dismiss(),
    });
    formAssist = new FormAssist({
      vault,
      enabled: () => preferences.get().passwordAutofill,
      neverOffers: (origin) =>
        store.getPermission(origin, 'save-passwords') === false,
      neverOffer: (origin) =>
        store.setPermission(origin, 'save-passwords', false),
      authorize,
      certificateException: (address) =>
        certificateStores().some((from) =>
          hasCertificateException(from, address),
        ),
      generatePassword: () => generatePassword((size) => randomBytes(size)),
      openManager: () => openSettings('passwords'),
      showMenu: (items) => {
        if (menuPlace) {
          autofillMenu.show(menuPlace.parent, menuPlace.anchor, items);
        }
      },
      hideMenu: () => autofillMenu.hide(),
      createId: randomUUID,
    });
    bridgeFormAssist({
      assist: formAssist,
      accepts: (from: Session) => {
        if (from === session.fromPartition(WEB_PARTITION)) {
          return { canSave: true };
        }
        return from === privateProfile?.session ? { canSave: false } : null;
      },
      prompt: (prompt) => {
        const front = currentWindow();
        for (const trailWindow of windows) {
          // A popup's offer belongs to no page, so it goes where the user is.
          if (prompt === null || prompt.pageId || trailWindow === front) {
            trailWindow.sendCredentialPrompt(prompt);
          }
        }
      },
      notify: (notice) => currentWindow()?.notify(notice),
      setAnchor: (parent, anchor) => {
        menuPlace = { parent, anchor };
      },
      key: (key) => autofillMenu.key(key),
    });
    // Progress events are frequent; tell the shell at most every 200 ms.
    let downloadsTimer: ReturnType<typeof setTimeout> | null = null;
    downloads.onChange(() => {
      downloadsTimer ??= setTimeout(() => {
        downloadsTimer = null;
        for (const trailWindow of windows) {
          if (!trailWindow.isPrivate) trailWindow.sendDownloads();
        }
        settings?.send(eventChannels.downloads, downloads.list());
        app.dock?.setBadge(
          downloads.activeCount > 0 ? String(downloads.activeCount) : '',
        );
      }, 200);
    });
    const webSession = session.fromPartition(WEB_PARTITION);
    cleaner = new BrowsingDataCleaner({
      store,
      clearSiteData: async () => {
        // Extensions keep their working data in the same session; uBlock
        // Origin would have to rebuild its filter lists without it.
        await webSession.clearData({
          dataTypes: [
            'backgroundFetch',
            'cookies',
            'fileSystems',
            'indexedDB',
            'localStorage',
            'serviceWorkers',
            'webSQL',
          ],
          // Turned off isn't removed: its settings wait for it to come back.
          excludeOrigins: (extensions?.knownIds() ?? []).map(
            (id) => `chrome-extension://${id}`,
          ),
        });
        await webSession.clearStorageData({
          storages: ['shadercache', 'cachestorage'],
        });
        await webSession.cookies.flushStore();
      },
      clearCache: () => webSession.clearCache(),
      clearDownloadList: () => downloads.clearFinished(),
      forgetClosedPages: () => {
        // The menus list recent pages, and those may just have been cleared.
        refreshMenu();
        // On launch or quit no window is open, and only the saved copy exists.
        if (regularWindowCount() === 0) {
          trails.lead?.forgetClosed();
          forgetSavedClosedPages();
          return;
        }
        for (const trailWindow of windows) {
          if (!trailWindow.isPrivate) trailWindow.controller.forgetClosed();
        }
        // A file that's no longer on any page leaves no trace of its path.
        forgetLocalFiles(
          [...windows]
            .filter((trailWindow) => !trailWindow.isPrivate)
            .flatMap((trailWindow) =>
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
    cookies = new CookieViewer({
      jar: webSession.cookies as CookieJar,
      now: Date.now,
      createToken: randomUUID,
    });
    quitClear = new QuitClear({
      store,
      chosen: () => preferences.get().clearOnQuit,
      clear: (request) => cleaner.clear(request),
    });
    // Whatever a crash left behind goes before any page can see it.
    await quitClear.atLaunch();
    preferences.onChange((changed) => {
      for (const trailWindow of windows) trailWindow.applyPreferences(changed);
      settings?.send(eventChannels.preferences, changed);
      refreshMenu();
    });

    refreshMenu();
    try {
      extensions = createExtensionHost();
      extensions.onChange(() =>
        settings?.send(eventChannels.extensions, extensions?.list() ?? []),
      );
      // Before the first window, so restored pages open with uBlock Origin
      // already running.
      await extensions.loadBundled();
    } catch (error) {
      console.error('Extensions are unavailable', error);
    }
    const firstWindow = openStartupWindows();
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

    // Clicking the Dock with nothing open brings a window back. With only
    // private windows open, it's a regular window that's missing.
    app.on('activate', (_event, hasVisibleWindows) => {
      if (windows.size === 0 || (!hasVisibleWindows && !regularWindow())) {
        openWindow();
      }
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
      rememberOpenWindows();
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

  // By now the pages are gone, so nothing can write its cookies back.
  app.on('will-quit', (event) => {
    if (!quitClear || quitClearDone) {
      persister?.dispose();
      store?.close();
      return;
    }
    event.preventDefault();
    quitClearDone = true;
    // Electron ignores a quit while this event is still being handled, which
    // is the case when there was nothing to clear.
    void quitClear.atQuit().finally(() => setImmediate(() => app.quit()));
  });

  app.on('window-all-closed', () => {
    // Chromium can drop an approved quit while Settings closes alongside the
    // browser window, which would leave Splash running with no windows.
    if (process.platform !== 'darwin' || quitApproved) app.quit();
  });
}
