import { randomUUID } from 'node:crypto';
import { readdirSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { session, type Session } from 'electron';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { SitePermission } from '../../shared/types';
import type { ExtensionHost } from '../extensions/extension-host';
import { createDownloadManager } from '../downloads/electron-downloads';
import type { DownloadManager } from '../downloads/download-manager';
import type { PreferencesService } from '../preferences';
import { CookieViewer, type CookieJar } from '../privacy/cookies';
import type { ContentBlockingHost } from '../privacy/electron-content-blocker';
import { createSiteRules } from '../privacy/electron-site-rules';
import { copyTrustedSites } from '../privacy/ublock';
import type { ThreatList } from '../security/threat-list';
import {
  configureAppSession,
  configureWebSession,
  WEB_PARTITION,
} from '../security/web-security';
import { SqliteTrailStore } from '../storage/sqlite-trail-store';
import type { PermissionRecord, TrailStore } from '../storage/trail-store';
import { SharedTrails, type BrowserController } from './browser-controller';

/**
 * Starts from the decisions the user already made, so a site they blocked stays
 * blocked, and keeps new ones only for as long as the windows are open.
 */
class PrivateStore extends SqliteTrailStore {
  constructor(private readonly regular: TrailStore) {
    super(new DatabaseSync(':memory:'));
  }

  override getPermission(
    origin: string,
    permission: SitePermission,
  ): boolean | null {
    return (
      super.getPermission(origin, permission) ??
      this.regular.getPermission(origin, permission)
    );
  }

  /** What applies here: the regular decisions, with this window's own over them. */
  override listPermissions(): PermissionRecord[] {
    const own = super.listPermissions();
    const decided = new Set(own.map((r) => `${r.origin} ${r.permission}`));
    return [
      ...this.regular
        .listPermissions()
        .filter((r) => !decided.has(`${r.origin} ${r.permission}`)),
      ...own,
    ];
  }
}

/**
 * Private windows keep their data on disk, in a partition of its own, because
 * Electron loads no extensions into an in-memory session, and uBlock Origin
 * and Splash's helper are extensions. The folder is deleted when the last
 * private window closes, and any left by a crash or a quit goes at the next
 * launch (sweepPrivateProfiles).
 */
const PRIVATE_PREFIX = 'private-';

/**
 * Deletes every private profile's folder under `userData`. Only safe while no
 * private window is open: at launch, and as Splash quits.
 */
export function sweepPrivateProfiles(userData: string): void {
  const partitions = path.join(userData, 'Partitions');
  let names: string[] = [];
  try {
    names = readdirSync(partitions);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(PRIVATE_PREFIX)) continue;
    try {
      rmSync(path.join(partitions, name), { recursive: true, force: true });
    } catch (error) {
      console.error('Could not delete a private window’s data', error);
    }
  }
}

/** Past the disk cache's last write of its index after a clear. */
const CACHE_FLUSH_MS = 30_000;

function removeFolder(folder: string): Promise<void> {
  return rm(folder, { recursive: true, force: true }).catch((error: unknown) =>
    console.error('Could not delete a private window’s data', error),
  );
}

/** Every private window shares this until the last one closes. */
export interface PrivateProfile {
  trails: SharedTrails;
  session: Session;
  store: TrailStore;
  downloads: DownloadManager;
  cookies: CookieViewer;
  windows: number;
  /** Marks a fresh profile's first workspace as private. */
  nameWorkspace(controller: BrowserController): void;
  /** Erases what the windows left behind. */
  discard(): Promise<void>;
}

export function openPrivateProfile(options: {
  store: TrailStore;
  preferences: PreferencesService;
  threats: ThreatList;
  blocker: ContentBlockingHost;
  /** uBlock Origin runs here too; only what comes with Splash, as in Chrome. */
  extensions?: Pick<ExtensionHost, 'addSession' | 'forgetSession'> | null;
  onDownloads(): void;
}): PrivateProfile {
  const { preferences, threats, blocker, extensions } = options;
  const web = session.fromPartition(`persist:${PRIVATE_PREFIX}${randomUUID()}`);
  const store = new PrivateStore(options.store);
  configureWebSession(web, store);
  const rules = createSiteRules(web, store, preferences, threats);
  blocker.attachSession(web, store, rules);
  // Sites trusted in uBlock Origin stay trusted here, as other decisions do.
  void extensions
    ?.addSession(web, { bundledOnly: true })
    .then(() => copyTrustedSites(session.fromPartition(WEB_PARTITION), web))
    .catch((error: unknown) =>
      console.error('uBlock Origin isn’t running in private windows', error),
    );
  const downloads = createDownloadManager(web, store, preferences);
  downloads.onChange(options.onDownloads);
  const cookies = new CookieViewer({
    jar: web.cookies as CookieJar,
    now: Date.now,
    createToken: randomUUID,
  });
  return {
    trails: new SharedTrails(),
    session: web,
    store,
    downloads,
    cookies,
    windows: 0,
    nameWorkspace(controller) {
      const { activeWorkspaceId } = controller.snapshot();
      if (!activeWorkspaceId) return;
      controller.customizeWorkspace(activeWorkspaceId, 'Private', {
        ...DEFAULT_APPEARANCE,
        accent: 'graphite',
        frame: 'stone',
      });
    },
    async discard() {
      downloads.dispose();
      cookies.dispose();
      configureAppSession(web);
      blocker.detachSession(web);
      extensions?.forgetSession(web);
      rules.uninstall();
      // Stops their background pages, which would keep writing to the folder.
      for (const extension of web.extensions?.getAllExtensions() ?? []) {
        web.extensions.removeExtension(extension.id);
      }
      try {
        const results = await Promise.allSettled([
          web.clearData(),
          web.clearCache(),
        ]);
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error(
              'Could not clear a private window’s data',
              result.reason,
            );
          }
        }
      } catch (error) {
        console.error('Could not clear a private window’s data', error);
      }
      const folder = web.storagePath;
      if (folder) {
        await removeFolder(folder);
        // The disk cache writes its (now empty) index once more after it's
        // cleared, which brings the folder back.
        setTimeout(() => void removeFolder(folder), CACHE_FLUSH_MS).unref();
      }
      store.close();
    },
  };
}
