import path from 'node:path';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { eventChannels } from '../../shared/api';
import type { SiteSettings } from '../../shared/types';
import type { DownloadManager } from '../downloads/download-manager';
import type { IpcTarget } from '../ipc/register-ipc';
import type { PreferencesService } from '../preferences';
import type { BrowsingDataCleaner } from '../privacy/browsing-data';
import type { ContentBlocking } from '../privacy/content-blocker';
import {
  decisionOf,
  PERMISSION_LABELS,
  SITE_PERMISSIONS,
} from '../security/permissions';
import type { TrailStore } from '../storage/trail-store';
import type { TrailWindow } from './browser-window';
import { isSameDocument, shellUrl } from './shell-url';

export interface SettingsWindowOptions {
  store: TrailStore;
  preferences: PreferencesService;
  downloads: DownloadManager;
  cleaner: BrowsingDataCleaner;
  blocker: ContentBlocking;
  /** The browser window that workspace settings act on. */
  browserWindow(): TrailWindow | null;
}

/** Whether Splash is the default for web links, and whether it can become so. */
function defaultBrowserStatus() {
  return {
    isDefault:
      app.isDefaultProtocolClient('https') &&
      app.isDefaultProtocolClient('http'),
    canChange: app.isPackaged,
  };
}

/**
 * The Settings window. It runs the same shell bundle at `#settings`; its
 * workspace and site actions go to the browser window, plus a few
 * settings-only channels.
 */
export class SettingsWindow {
  readonly window: BrowserWindow;
  private readonly url = `${shellUrl()}#settings`;

  constructor(private readonly options: SettingsWindowOptions) {
    this.window = new BrowserWindow({
      width: 820,
      height: 600,
      minWidth: 640,
      minHeight: 440,
      show: false,
      title: 'Settings',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f3efe9',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    const contents = this.window.webContents;
    contents.on('will-navigate', (event) => {
      if (!isSameDocument(event.url, this.url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.once('ready-to-show', () => this.window.show());
    void this.window.loadURL(this.url);
  }

  /** Browser-window channels it may use, plus its own. */
  get ipc(): IpcTarget {
    const browser = this.options.browserWindow();
    const { cleaner } = this.options;
    return {
      isShellUrl: (candidate) => isSameDocument(candidate, this.url),
      invoke: {
        ...(browser
          ? {
              'browser:get-snapshot':
                browser.ipc.invoke['browser:get-snapshot'],
              'workspace:switch': browser.ipc.invoke['workspace:switch'],
              'workspace:move': browser.ipc.invoke['workspace:move'],
              'workspace:rename': browser.ipc.invoke['workspace:rename'],
              'site:set-permission': browser.ipc.invoke['site:set-permission'],
              'site:reset': browser.ipc.invoke['site:reset'],
              'downloads:list': browser.ipc.invoke['downloads:list'],
              'downloads:act': browser.ipc.invoke['downloads:act'],
              'downloads:clear': browser.ipc.invoke['downloads:clear'],
              'downloads:open-folder':
                browser.ipc.invoke['downloads:open-folder'],
            }
          : {}),
        'preferences:get': () => this.options.preferences.get(),
        'preferences:update': ({ patch }) =>
          this.options.preferences.update(patch),
        'settings:sites': () => this.sites(),
        'settings:content-blocking': () => this.options.blocker.getStatus(),
        'settings:update-filter-lists': async () => {
          await this.options.blocker.update().catch(() => undefined);
          return this.options.blocker.getStatus();
        },
        'settings:clear-data': (request) => cleaner.clear(request),
        'settings:undo-clear': ({ token }) => cleaner.restore(token),
        'settings:default-browser': () => defaultBrowserStatus(),
        'settings:make-default-browser': () => {
          if (app.isPackaged) {
            app.setAsDefaultProtocolClient('http');
            app.setAsDefaultProtocolClient('https');
          }
          return defaultBrowserStatus();
        },
        'settings:open-data-folder': () => {
          void shell.openPath(app.getPath('userData'));
        },
        'settings:about': () => ({
          version: app.getVersion(),
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          dataFolder: app.getPath('userData'),
        }),
        'settings:edit-workspace': ({ workspaceId }) => {
          const target = this.options.browserWindow();
          if (!target) return;
          if (workspaceId) target.controller.switchWorkspace(workspaceId);
          target.window.show();
          target.window.focus();
          target.sendUiCommand(
            workspaceId
              ? { type: 'customize-workspace' }
              : { type: 'create-workspace' },
          );
        },
        'settings:delete-workspace': ({ workspaceId }) => {
          this.options.browserWindow()?.controller.deleteWorkspace(workspaceId);
        },
      },
      send: {},
    };
  }

  send(
    channel: (typeof eventChannels)[keyof typeof eventChannels],
    payload: unknown,
  ) {
    if (!this.window.isDestroyed())
      this.window.webContents.send(channel, payload);
  }

  focus(): void {
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  /** Every site with a remembered decision, grouped. */
  private sites(): SiteSettings[] {
    const bySite = new Map<string, Map<string, boolean>>();
    for (const record of this.options.store.listPermissions()) {
      const decisions = bySite.get(record.origin) ?? new Map();
      decisions.set(record.permission, record.granted);
      bySite.set(record.origin, decisions);
    }
    return [...bySite.entries()].map(([origin, decisions]) => ({
      origin,
      host: new URL(origin).host,
      permissions: SITE_PERMISSIONS.filter((permission) =>
        decisions.has(permission),
      ).map((permission) => ({
        permission,
        label: PERMISSION_LABELS[permission],
        decision: decisionOf(decisions.get(permission) ?? null),
      })),
    }));
  }
}
