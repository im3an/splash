import path from 'node:path';
import { app, BrowserWindow, nativeTheme, session } from 'electron';
import { registerIpc } from './ipc/register-ipc';
import { installApplicationMenu } from './menus/application-menu';
import {
  configureAppSession,
  configureWebSession,
  hardenAllWebContents,
  WEB_PARTITION,
} from './security/web-security';
import { openTrailStore } from './storage/sqlite-trail-store';
import type { TrailStore } from './storage/trail-store';
import { TrailWindow } from './windows/browser-window';

const APPEARANCE_KEY = 'appearance';
const windows = new Set<TrailWindow>();
let store: TrailStore;

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

    const opened = openTrailStore(
      path.join(app.getPath('userData'), 'splash.db'),
    );
    store = opened.store;
    if (opened.recoveredFrom) {
      console.warn(
        `The saved session could not be read and was moved to ${opened.recoveredFrom}`,
      );
    }
    const appearance = store.getPreference(APPEARANCE_KEY);
    if (appearance === 'light' || appearance === 'dark') {
      nativeTheme.themeSource = appearance;
    }

    refreshMenu();
    openWindow();

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
