import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { session, type Session } from 'electron';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { SitePermission } from '../../shared/types';
import { createDownloadManager } from '../downloads/electron-downloads';
import type { DownloadManager } from '../downloads/download-manager';
import type { PreferencesService } from '../preferences';
import { CookieViewer, type CookieJar } from '../privacy/cookies';
import type { ContentBlockingHost } from '../privacy/electron-content-blocker';
import { createSiteRules } from '../privacy/electron-site-rules';
import type { ThreatList } from '../security/threat-list';
import {
  configureAppSession,
  configureWebSession,
} from '../security/web-security';
import { SqliteTrailStore } from '../storage/sqlite-trail-store';
import type { TrailStore } from '../storage/trail-store';
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
  onDownloads(): void;
}): PrivateProfile {
  const { preferences, threats, blocker } = options;
  // A partition without the `persist:` prefix is kept in memory.
  const web = session.fromPartition(`private-${randomUUID()}`);
  const store = new PrivateStore(options.store);
  configureWebSession(web, store);
  const rules = createSiteRules(web, store, preferences, threats);
  blocker.attachSession(web, store, rules);
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
      rules.uninstall();
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
      store.close();
    },
  };
}
