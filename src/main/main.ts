import { app, BrowserWindow, nativeTheme, session } from 'electron';
import type { Appearance } from '../shared/types';
import { registerIpc } from './ipc/register-ipc';
import { installApplicationMenu, syncAppearanceMenu } from './menu';
import {
  configureAppSession,
  configureWebSession,
  hardenAllWebContents,
  WEB_PARTITION,
} from './security/web-security';
import { TrailWindow } from './windows/browser-window';

const windows = new Set<TrailWindow>();

/** Applies the shell's appearance preference to every window and web page. */
function setAppearance(appearance: Appearance): void {
  nativeTheme.themeSource = appearance;
  syncAppearanceMenu(appearance);
}

function openWindow(): TrailWindow {
  const trailWindow = new TrailWindow({ onAppearance: setAppearance });
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
    installApplicationMenu({ currentWindow, openWindow });
    openWindow();

    app.on('activate', () => {
      if (windows.size === 0) openWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
