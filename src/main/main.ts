import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app, BrowserWindow, dialog, nativeTheme, session } from 'electron';
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
import { TrailWindow } from './windows/browser-window';

const APPEARANCE_KEY = 'appearance';
const windows = new Set<TrailWindow>();
let store: TrailStore;

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
  installApplicationMenu({ currentWindow, openWindow, store });
}

function openWindow(): TrailWindow {
  const trailWindow = new TrailWindow({
    store,
    onWorkspacesChanged: refreshMenu,
  });
  windows.add(trailWindow);
  trailWindow.window.on('closed', () => windows.delete(trailWindow));
  return trailWindow;
}

function currentWindow(): TrailWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  for (const trailWindow of windows) {
    if (trailWindow.window === focused) return trailWindow;
  }
  return windows.values().next().value ?? null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  hardenAllWebContents();

  app.on('second-instance', () => {
    const trailWindow = currentWindow() ?? openWindow();
    if (trailWindow.window.isMinimized()) trailWindow.window.restore();
    trailWindow.window.focus();
  });

  registerIpc((sender) => {
    for (const trailWindow of windows) {
      if (trailWindow.window.webContents === sender) return trailWindow.ipc;
    }
    return null;
  });

  void app.whenReady().then(() => {
    configureAppSession(session.defaultSession);
    configureWebSession(session.fromPartition(WEB_PARTITION));

    const startup = openStartupStore();
    store = startup.store;
    const appearance = store.getPreference(APPEARANCE_KEY);
    if (appearance === 'light' || appearance === 'dark') {
      nativeTheme.themeSource = appearance;
    }

    refreshMenu();
    const firstWindow = openWindow();
    if (startup.notice) {
      const { message, detail } = startup.notice;
      firstWindow.window.once('ready-to-show', () => {
        void dialog.showMessageBox(firstWindow.window, {
          type: 'warning',
          message,
          detail,
        });
      });
    }

    app.on('activate', () => {
      if (windows.size === 0) openWindow();
    });
  });

  app.on('before-quit', () => {
    for (const trailWindow of windows) trailWindow.flush();
  });

  app.on('will-quit', () => store?.close());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
