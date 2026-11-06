import path from 'node:path';
import { app, BrowserWindow, clipboard, nativeTheme, shell } from 'electron';
import { eventChannels } from '../../shared/api';
import { DEFAULT_APPEARANCE, frameColor } from '../../shared/appearance';
import type { SiteSettings } from '../../shared/types';
import type { DownloadManager } from '../downloads/download-manager';
import type { ExtensionHost } from '../extensions/extension-host';
import type { IpcTarget } from '../ipc/register-ipc';
import type { PreferencesService } from '../preferences';
import type { BrowsingDataCleaner } from '../privacy/browsing-data';
import type { ContentBlocking } from '../privacy/content-blocker';
import type { CookieViewer } from '../privacy/cookies';
import {
  decisionOf,
  PERMISSION_LABELS,
  SITE_PERMISSIONS,
} from '../security/permissions';
import type { ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import type { Vault } from '../vault/vault';
import type { Transfer } from '../transfer/transfer';
import {
  exportPasswords,
  importChosenFile,
} from '../transfer/transfer-dialogs';
import type { TrailWindow } from './browser-window';
import { isSameDocument, shellUrl } from './shell-url';

export interface SettingsWindowOptions {
  store: TrailStore;
  preferences: PreferencesService;
  downloads: DownloadManager;
  cleaner: BrowsingDataCleaner;
  blocker: ContentBlocking;
  cookies: CookieViewer;
  threats: ThreatList;
  extensions(): ExtensionHost | null;
  vault: Vault;
  transfer: Transfer;
  /** Touch ID, or the closest thing this Mac has. */
  authorize(reason: string): Promise<boolean>;
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
  /** Where to open, until the page has loaded and asked. */
  private section: string | null = null;

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
      backgroundColor: frameColor(
        DEFAULT_APPEARANCE,
        nativeTheme.shouldUseDarkColors,
      ),
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
    // Settings are saved as they change, so a crashed window just reloads.
    let crashes = 0;
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit' || this.window.isDestroyed()) return;
      if (++crashes <= 3) contents.reload();
    });
    this.window.once('ready-to-show', () => this.window.show());
    void this.window.loadURL(this.url);
  }

  /** Browser-window channels it may use, plus its own. */
  get ipc(): IpcTarget {
    const browser = this.options.browserWindow();
    const { cleaner, cookies, vault, transfer, authorize } = this.options;
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
        'vault:list': () => vault.listing(),
        'vault:save-login': ({ id, origin, username, password }) => {
          vault.saveLogin({ origin, username, password }, id);
        },
        'vault:save-address': ({ id, fields }) => {
          vault.saveAddress(fields, id);
        },
        'vault:save-card': ({ id, fields }) => {
          vault.saveCard(fields, id);
        },
        'vault:delete': ({ id }) => vault.delete(id),
        'vault:undo': ({ token }) => vault.undo(token),
        'vault:reveal': async ({ id }) =>
          (await authorize('show a saved password'))
            ? (vault.login(id)?.password ?? null)
            : null,
        'vault:copy': async ({ id }) => {
          const login = vault.login(id);
          if (!login || !(await authorize('copy a saved password'))) {
            return false;
          }
          clipboard.writeText(login.password);
          return true;
        },
        'vault:export': () => exportPasswords(this.window, vault, authorize),
        'transfer:sources': () => transfer.sources(),
        'transfer:import': ({ id, bookmarks, history }) =>
          transfer.importFrom(id, { bookmarks, history }),
        'transfer:import-file': () => importChosenFile(this.window, transfer),
        'transfer:undo': ({ token }) => transfer.undo(token),
        'transfer:trash': ({ token }) => transfer.trashFile(token),
        'transfer:export-bookmarks': () => {
          const target = this.options.browserWindow();
          return target ? target.saveBookmarks() : null;
        },
        'preferences:get': () => this.options.preferences.get(),
        'preferences:update': ({ patch }) =>
          this.options.preferences.update(patch),
        'settings:sites': () => this.sites(),
        'cookies:list': ({ host }) => cookies.list(host),
        'cookies:delete': ({ site, only }) => cookies.delete(site, only),
        'cookies:undo': ({ token }) => cookies.restore(token),
        'settings:content-blocking': () => this.options.blocker.getStatus(),
        'settings:threat-list': () => this.options.threats.getStatus(),
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
        'settings:take-section': () => {
          const section = this.section;
          this.section = null;
          return section;
        },
        'extensions:list': () => this.options.extensions()?.list() ?? [],
        'extensions:set-enabled': ({ id, enabled }) =>
          this.extensionHost().setEnabled(id, enabled),
        'extensions:remove': ({ id }) => this.extensionHost().remove(id),
        'extensions:open-store': () => this.extensionHost().openWebStore(),
        'extensions:open-page': ({ url }) => this.extensionHost().openPage(url),
        'extensions:load-unpacked': () =>
          this.extensionHost().loadUnpacked(this.window),
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
        'settings:delete-workspace': ({ workspaceId }) =>
          this.options.browserWindow()?.controller.deleteWorkspace(workspaceId),
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

  /** Opens on a section: at once if the page is up, or as soon as it asks. */
  showSection(section: string): void {
    if (this.window.webContents.isLoading()) this.section = section;
    else this.send(eventChannels.settingsSection, section);
  }

  private extensionHost(): ExtensionHost {
    const host = this.options.extensions();
    if (!host) throw new Error('Extensions are unavailable');
    return host;
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
