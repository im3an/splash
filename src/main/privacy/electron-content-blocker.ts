import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  ipcMain,
  net,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import type { Fetch } from '@ghostery/adblocker';
import { contentsForPage, pageHandleFor } from '../browser/electron-page-host';
import type { PreferencesService } from '../preferences';
import { webOrigin } from '../security/permissions';
import type { ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import { AUTOCONSENT } from '../../shared/page-bridge';
import { autoconsentReply } from './autoconsent';
import type { SiteRules } from './electron-site-rules';
import { createHelperExtension } from './helper-extension';
import {
  bundleScriptlets,
  ContentBlocker,
  isConsentPage,
  RETRY_DELAY,
  type ContentBlocking,
  type DomFeatures,
} from './content-blocker';
import {
  blockedOn,
  listStatus,
  setTrusted,
  trusted,
  ublockRunning,
  updateLists,
} from './ublock';

/** Channels used by `@ghostery/adblocker-electron-preload`. */
const INJECT_COSMETICS = '@ghostery/adblocker/inject-cosmetic-filters';
const MUTATION_OBSERVER = '@ghostery/adblocker/is-mutation-observer-enabled';
/** Pages report at most this many classes, ids or links per update. */
const MAX_FEATURES = 2000;

const fetchList: Fetch = async (url) => {
  const response = await net.fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response;
};

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, MAX_FEATURES);
}

/** DOM features from a page are untrusted; keep only well-formed ones. */
function domFeatures(message: unknown): DomFeatures | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const { classes, hrefs, ids } = message as Record<string, unknown>;
  return {
    classes: strings(classes),
    hrefs: strings(hrefs),
    ids: strings(ids),
  };
}

/** A blocker whose lists are saved in `fileName` in the app's data folder. */
function createBlocker(fileName: string): ContentBlocker {
  const cacheFile = path.join(app.getPath('userData'), fileName);
  return new ContentBlocker({
    readCache: async () => {
      try {
        const [data, info] = await Promise.all([
          readFile(cacheFile),
          stat(cacheFile),
        ]);
        return { data, savedAt: info.mtimeMs };
      } catch {
        return null;
      }
    },
    writeCache: (data) => writeFile(cacheFile, data),
    fetch: fetchList,
    now: Date.now,
  });
}

/** The blocker, and the way another browsing session joins it. */
export interface ContentBlockingHost extends ContentBlocking {
  /**
   * Starts Splash's rules in a session: the helper extension, the frames'
   * settings and the cookie-notice preload. uBlock Origin comes with the
   * session's extensions (ExtensionHost.addSession).
   */
  attachSession(
    target: Session,
    from: Pick<TrailStore, 'getPermission' | 'listPermissions'>,
    rules: SiteRules,
  ): void;
  detachSession(target: Session): void;
}

/**
 * Ads and trackers are uBlock Origin's: it blocks them on the network, hides
 * them and runs its scriptlets, in every session. Splash's own part is cookie
 * notices (hiding rules from the cookie lists, and autoconsent to reject) and
 * its request rules in the helper extension. No `session.webRequest` listener
 * may be registered anywhere: Electron then gives uBlock Origin no requests.
 */
export function enableContentBlocking(
  session: Session,
  store: Pick<TrailStore, 'getPermission' | 'listPermissions'>,
  preferences: PreferencesService,
  rules: SiteRules,
  threats: ThreatList,
): ContentBlockingHost {
  const sessions = new Set<Session>([session]);
  const helper = createHelperExtension({ preferences, threats });

  /** Whether cookie notices are rejected and hidden on the page. */
  const handlesCookiesOn = async (
    pageUrl: string | null,
    target: Session,
  ): Promise<boolean> => {
    if (!preferences.get().hideCookieNotices) return false;
    const origin = webOrigin(pageUrl ?? undefined);
    // Off where the user allowed ads, as before uBlock Origin held that.
    return !(origin && (await trusted(target, origin)) === true);
  };
  // Hiding only: the lists' scriptlets sometimes agree for the user.
  const cookieNotices = createBlocker('cookie-notice-lists.bin');

  /** The preload and helper one browsing session needs. */
  const attach = (
    target: Session,
    from: Pick<TrailStore, 'getPermission' | 'listPermissions'>,
    siteRules: SiteRules,
  ): void => {
    siteRules.install();
    void helper.attach(target, from);
    // Hiding rules go into the page from here; the preload only reports the
    // page's classes and ids.
    target.registerPreloadScript({
      type: 'frame',
      filePath: path.join(__dirname, 'content-preload.cjs'),
    });
  };

  attach(session, store, rules);
  ipcMain.handle(
    INJECT_COSMETICS,
    async (event: IpcMainInvokeEvent, _url: unknown, message: unknown) => {
      const contents = event.sender;
      if (!pageHandleFor(contents) || event.senderFrame?.parent) return;
      const url = contents.getURL();
      if (
        isConsentPage(url) ||
        !(await handlesCookiesOn(url, contents.session))
      ) {
        return;
      }
      const features = message === undefined ? undefined : domFeatures(message);
      const cosmetics = cookieNotices.cosmeticsFor(url, features);
      if (!cosmetics) return;
      if (cosmetics.styles) {
        void contents
          .insertCSS(cosmetics.styles, { cssOrigin: 'user' })
          .catch(() => undefined);
      }
      const scriptlets = bundleScriptlets(cosmetics.scripts);
      if (scriptlets) {
        void contents
          .executeJavaScript(scriptlets, true)
          .catch(() => undefined);
      }
    },
  );
  // Frames don't get hiding rules of their own, so they needn't report.
  ipcMain.handle(
    MUTATION_OBSERVER,
    (event) => !!pageHandleFor(event.sender) && !event.senderFrame?.parent,
  );

  // DuckDuckGo's autoconsent runs in every frame of a page and asks here for
  // its rules, and to run steps in the frame's own page context.
  ipcMain.handle(
    AUTOCONSENT,
    async (event: IpcMainInvokeEvent, message: unknown) => {
      const frame = event.senderFrame;
      if (!frame || !pageHandleFor(event.sender)) return null;
      return autoconsentReply(message, {
        frameUrl: frame.url,
        isMainFrame: !frame.parent,
        enabled: await handlesCookiesOn(
          event.sender.getURL(),
          event.sender.session,
        ),
        evaluate: (code) => frame.executeJavaScript(code),
      });
    },
  );

  // A failed download, or lists a week old, are fetched again later.
  void cookieNotices.load().catch(() => undefined);
  setInterval(
    () => cookieNotices.refreshIfStale().catch(() => undefined),
    RETRY_DELAY,
  );

  return {
    attachSession(target, from, siteRules) {
      sessions.add(target);
      attach(target, from, siteRules);
    },
    detachSession(target) {
      sessions.delete(target);
      helper.detach(target);
    },
    async adsOn(pageId, origin) {
      const contents = contentsForPage(pageId);
      if (!contents || !ublockRunning(contents.session)) {
        return { blocked: 0, allowed: null };
      }
      const [blocked, allowed] = await Promise.all([
        blockedOn(contents),
        trusted(contents.session, origin),
      ]);
      return { blocked, allowed };
    },
    setAdsAllowed: (target, origin, allowed) =>
      setTrusted(target, origin, allowed),
    getStatus: () => listStatus(session),
    update: async () => {
      // Each session's copy of uBlock Origin keeps lists of its own.
      await Promise.all([...sessions].map((target) => updateLists(target)));
      await cookieNotices.update().catch(() => undefined);
    },
  };
}
