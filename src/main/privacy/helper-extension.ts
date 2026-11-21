import path from 'node:path';
import { app, webContents, type Session, type WebContents } from 'electron';
import {
  HELPER_PERMISSIONS,
  type HelperDecisions,
  type HelperPermission,
  type HelperSettings,
} from '../../helper-extension/rules';
import type { PreferencesService } from '../preferences';
import { identityOf, type BrowserIdentity } from '../security/client-hints';
import { httpsUpgradeFor } from '../security/https-only';
import { dangerousSiteKey, type ThreatList } from '../security/threat-list';
import { onPermissionsChanged } from '../storage/sqlite-trail-store';
import type { TrailStore } from '../storage/trail-store';

/**
 * Splash's own request rules run in a small bundled extension, built from
 * src/helper-extension into this folder under `extensions/`. Electron hands
 * an extension's `chrome.webRequest` listeners no requests while the session
 * has a `session.webRequest` listener of its own, for any event, and uBlock
 * Origin blocks through those listeners. So Splash registers none, and what
 * its hooks did (HTTPS-only mode, the dangerous-site warning, the privacy
 * signal, client hints, third-party cookies, per-site scripts and images)
 * happens in the helper, beside uBlock Origin.
 */
export const HELPER_FOLDER = 'splash-helper';

/** What client hints say this browser is; the same for every session. */
let identity: BrowserIdentity | null = null;
function browserIdentity(): BrowserIdentity {
  identity ??= identityOf({
    chromeVersion: process.versions.chrome,
    platform: process.platform,
    systemVersion: process.getSystemVersion(),
    arch: process.arch,
  });
  return identity;
}

/** How long a session's helper may take to start before it's given up on. */
const START_LIMIT_MS = 15_000;

export function bundledExtensionPath(folder: string): string {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(root, 'extensions', folder);
}

/** An extension's background page in one session, once it's there. */
export function backgroundPageOf(
  session: Session,
  extensionId: string,
): WebContents | null {
  const prefix = `chrome-extension://${extensionId}/`;
  return (
    webContents
      .getAllWebContents()
      .find(
        (contents) =>
          !contents.isDestroyed() &&
          contents.session === session &&
          contents.getType() === 'backgroundPage' &&
          contents.getURL().startsWith(prefix),
      ) ?? null
  );
}

/** The extension loaded from `folder` in this session, if it is. */
export function extensionFrom(
  session: Session,
  folder: string,
): Electron.Extension | null {
  const wanted = bundledExtensionPath(folder);
  return (
    session.extensions
      .getAllExtensions()
      .find((extension) => extension.path === wanted) ?? null
  );
}

/** Decisions the helper needs, with the store they come from. */
type Decisions = Pick<TrailStore, 'getPermission' | 'listPermissions'>;

/** What main itself needs to know about a session's rules. */
export interface SessionRules {
  /** Whether the helper stops `url` as a page's address: reported dangerous. */
  isDangerous(url: string): boolean;
  /** Where the helper sends a page's plain address instead, if anywhere. */
  upgradeOf(url: string): string | null;
  /**
   * A popup's try at HTTPS failed and it loads `url` over HTTP: tells the
   * helper to let it through. Resolves once the helper knows.
   */
  allowPlain(contentsId: number, url: string): Promise<void>;
}

const rulesBySession = new WeakMap<Session, SessionRules>();

/** The rules a page's or popup's session runs under, if Splash set any. */
export function sessionRulesFor(session: Session): SessionRules | null {
  return rulesBySession.get(session) ?? null;
}

interface Attached {
  store: Decisions;
  /** The helper's background page, once it has started. */
  page: WebContents | null;
  /** Whether a push is waiting for the next turn. */
  queued: boolean;
}

export interface HelperExtension {
  /** Loads the helper into a session and gives it that profile's settings. */
  attach(session: Session, store: Decisions): Promise<void>;
  detach(session: Session): void;
}

export function createHelperExtension(options: {
  preferences: PreferencesService;
  threats: ThreatList;
}): HelperExtension {
  const { preferences, threats } = options;
  const attached = new Map<Session, Attached>();

  const decision = (
    store: Decisions,
    origin: string,
    permission: HelperPermission,
  ): boolean | null => {
    try {
      return store.getPermission(origin, permission);
    } catch (error) {
      console.error('Storage error', error);
      return null;
    }
  };

  const settingsFor = (store: Decisions): HelperSettings => {
    const wanted = new Set<string>(HELPER_PERMISSIONS);
    let origins: string[] = [];
    try {
      origins = store
        .listPermissions()
        .filter((record) => wanted.has(record.permission))
        .map((record) => record.origin);
    } catch (error) {
      console.error('Storage error', error);
    }
    const decisions: HelperDecisions = {};
    for (const origin of new Set(origins)) {
      for (const permission of HELPER_PERMISSIONS) {
        // Through getPermission, so a private window's own decisions win
        // over the ones it inherits.
        const decided = decision(store, origin, permission);
        if (decided !== null) (decisions[origin] ??= {})[permission] = decided;
      }
    }
    const prefs = preferences.get();
    return {
      privacySignal: prefs.privacySignal,
      blockThirdPartyCookies: prefs.blockThirdPartyCookies,
      httpsOnly: prefs.httpsOnly,
      warnDangerousSites: prefs.warnDangerousSites,
      identity: browserIdentity(),
      decisions,
    };
  };

  const run = async (page: WebContents, code: string): Promise<void> => {
    if (page.isDestroyed()) return;
    await page.executeJavaScript(code);
  };

  const pushSettings = (entry: Attached): Promise<void> =>
    entry.page
      ? run(
          entry.page,
          `self.splashHelper.apply(${JSON.stringify(settingsFor(entry.store))})`,
        ).catch((error: unknown) =>
          console.error('Could not update the helper extension', error),
        )
      : Promise.resolve();

  const pushThreats = (entry: Attached): Promise<void> =>
    entry.page
      ? run(
          entry.page,
          `self.splashHelper.setDangerousHosts(${JSON.stringify(threats.hosts())})`,
        ).catch((error: unknown) =>
          console.error('Could not update the helper extension', error),
        )
      : Promise.resolve();

  /** Several changes in one turn (a site reset) make one push. */
  const schedule = (entry: Attached) => {
    if (entry.queued) return;
    entry.queued = true;
    queueMicrotask(() => {
      entry.queued = false;
      void pushSettings(entry);
    });
  };

  const scheduleAll = () => {
    for (const entry of attached.values()) schedule(entry);
  };
  preferences.onChange(scheduleAll);
  onPermissionsChanged(scheduleAll);
  threats.onChange(() => {
    for (const entry of attached.values()) void pushThreats(entry);
  });

  /** Waits for the helper's page to start, then fills it in. */
  const start = async (session: Session, entry: Attached, id: string) => {
    const deadline = Date.now() + START_LIMIT_MS;
    for (;;) {
      const page = backgroundPageOf(session, id);
      const ready =
        page &&
        !page.isLoading() &&
        (await page
          .executeJavaScript('typeof self.splashHelper === "object"')
          .catch(() => false));
      if (page && ready) {
        entry.page = page;
        // A page that crashed or reloaded starts empty again.
        page.on('did-finish-load', () => {
          void pushSettings(entry);
          void pushThreats(entry);
        });
        await Promise.all([pushSettings(entry), pushThreats(entry)]);
        return;
      }
      if (Date.now() > deadline) {
        throw new Error('The helper extension didn’t start');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  return {
    async attach(session, store) {
      if (attached.has(session)) return;
      const entry: Attached = { store, page: null, queued: false };
      attached.set(session, entry);
      rulesBySession.set(session, {
        isDangerous(url) {
          if (!preferences.get().warnDangerousSites) return false;
          const key = dangerousSiteKey(url);
          if (!key || !threats.isListed(new URL(key).hostname)) return false;
          return decision(store, key, 'dangerous') !== true;
        },
        upgradeOf(url) {
          return httpsUpgradeFor(url, preferences.get().httpsOnly, (origin) =>
            decision(store, origin, 'insecure'),
          );
        },
        async allowPlain(contentsId, url) {
          if (!entry.page) return;
          await run(
            entry.page,
            `self.splashHelper.allowPlain(${contentsId}, ${JSON.stringify(url)})`,
          ).catch((error: unknown) =>
            console.error('Could not update the helper extension', error),
          );
        },
      });
      try {
        // Extensions.addSession may have brought it here already.
        let extension = extensionFrom(session, HELPER_FOLDER);
        if (!extension) {
          try {
            extension = await session.extensions.loadExtension(
              bundledExtensionPath(HELPER_FOLDER),
            );
          } catch (error) {
            extension = extensionFrom(session, HELPER_FOLDER);
            if (!extension) throw error;
          }
        }
        await start(session, entry, extension.id);
      } catch (error) {
        console.error(
          'Splash’s site rules aren’t running: HTTPS-only mode, the dangerous-site warning and per-site rules are off in this session',
          error,
        );
      }
    },
    detach(session) {
      attached.delete(session);
      rulesBySession.delete(session);
    },
  };
}
