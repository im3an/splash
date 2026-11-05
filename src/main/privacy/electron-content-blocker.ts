import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  ipcMain,
  net,
  webContents,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import type { Fetch } from '@ghostery/adblocker';
import { pageHandleFor } from '../browser/electron-page-host';
import type { PreferencesService } from '../preferences';
import { httpsUpgradeFor } from '../security/https-only';
import { webOrigin } from '../security/permissions';
import type { TrailStore } from '../storage/trail-store';
import { AUTOCONSENT } from '../../shared/page-bridge';
import { autoconsentReply } from './autoconsent';
import {
  bundleScriptlets,
  combinedStatus,
  ContentBlocker,
  COOKIE_NOTICE_LISTS,
  RETRY_DELAY,
  type BlockerOptions,
  type ContentBlocking,
  type DomFeatures,
} from './content-blocker';

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
function createBlocker(
  fileName: string,
  options?: BlockerOptions,
): ContentBlocker {
  const cacheFile = path.join(app.getPath('userData'), fileName);
  return new ContentBlocker(
    {
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
    },
    options,
  );
}

/**
 * Blocks ads and trackers and handles cookie notices in the web session:
 * network requests, hiding rules, uBlock Origin's scriptlets for ads, and
 * autoconsent to reject cookies. Each has its own setting; a site the user
 * allowed lets everything through.
 */
export function enableContentBlocking(
  session: Session,
  store: TrailStore,
  preferences: PreferencesService,
): ContentBlocking {
  /** Whether the user allowed ads on the site at `pageUrl`, if they decided. */
  const allowedOn = (pageUrl: string | null): boolean | null => {
    const origin = webOrigin(pageUrl ?? undefined);
    try {
      return origin ? store.getPermission(origin, 'ads') : null;
    } catch (error) {
      console.error('Storage error', error);
      return null;
    }
  };
  /** Whether cookie notices are rejected and hidden on the page. */
  const handlesCookiesOn = (pageUrl: string | null) =>
    preferences.get().hideCookieNotices && allowedOn(pageUrl) !== true;
  const blockers = [
    {
      blocker: createBlocker('filter-lists.bin'),
      appliesOn: (pageUrl: string | null) => {
        const allowed = allowedOn(pageUrl);
        return allowed === null ? preferences.get().blockAds : !allowed;
      },
    },
    {
      // Hiding only: the lists' scriptlets sometimes agree for the user.
      blocker: createBlocker('cookie-notice-lists.bin', {
        lists: COOKIE_NOTICE_LISTS,
        scriptlets: false,
      }),
      appliesOn: handlesCookiesOn,
    },
  ];
  /** The blockers that apply on the page at `pageUrl`. */
  const blockersOn = (pageUrl: string | null) =>
    blockers
      .filter(({ appliesOn }) => appliesOn(pageUrl))
      .map(({ blocker }) => blocker);

  /** The trail page a request belongs to, if any. */
  const pageOf = (webContentsId: number | undefined) => {
    const contents =
      webContentsId === undefined
        ? undefined
        : webContents.fromId(webContentsId);
    const handle = pageHandleFor(contents);
    return handle && contents
      ? { handle, pageId: handle.pageId, url: contents.getURL() }
      : null;
  };

  /** Where HTTPS-only mode sends a page's request instead, if anywhere. */
  const upgradeOf = (
    url: string,
    resourceType: string,
    page: ReturnType<typeof pageOf>,
  ): string | null => {
    // Only a page's own address. Chromium already refuses or upgrades the
    // insecure parts of a secure page, and a window's shell is never upgraded.
    if (!page || resourceType !== 'mainFrame') return null;
    const secure = httpsUpgradeFor(
      url,
      preferences.get().httpsOnly,
      (origin) => {
        try {
          return store.getPermission(origin, 'insecure');
        } catch (error) {
          console.error('Storage error', error);
          return null;
        }
      },
    );
    if (secure) page.handle.upgraded(url, secure);
    return secure;
  };

  // These two hooks must stay registered while Splash runs Electron 45.0.0.
  // Electron's own hooks take precedence over an extension's blocking
  // `chrome.webRequest` listeners, and on 45.0.0 those listeners never
  // answer (electron/electron#55234, fixed in 45.0.1), so every request of
  // a page would hang behind uBlock Origin's.
  session.webRequest.onBeforeRequest(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      const page = pageOf(details.webContentsId);
      // Electron allows one listener, so HTTPS-only mode goes first here:
      // the request comes back through this hook on its way to HTTPS.
      const secure = upgradeOf(details.url, details.resourceType, page);
      if (secure) {
        callback({ redirectURL: secure });
        return;
      }
      const pageUrl = page?.url || details.referrer || null;
      // Every blocker sees a page start loading, to restart its count.
      const applying =
        details.resourceType === 'mainFrame'
          ? blockers.map(({ blocker }) => blocker)
          : blockersOn(pageUrl);
      for (const blocker of applying) {
        const response = blocker.onRequest(
          details,
          page?.pageId ?? null,
          pageUrl,
        );
        if (response.cancel || response.redirectURL) {
          callback(response);
          return;
        }
      }
      callback({});
    },
  );

  session.webRequest.onHeadersReceived(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      const pageUrl =
        details.resourceType === 'mainFrame'
          ? details.url
          : pageOf(details.webContentsId)?.url || null;
      const policies = blockersOn(pageUrl)
        .map((blocker) => blocker.cspFor(details))
        .filter((csp): csp is string => !!csp);
      if (policies.length === 0) {
        callback({});
        return;
      }
      const responseHeaders = { ...details.responseHeaders };
      for (const name of Object.keys(responseHeaders)) {
        if (name.toLowerCase() !== 'content-security-policy') continue;
        policies.push(...(responseHeaders[name] ?? []));
        delete responseHeaders[name];
      }
      responseHeaders['Content-Security-Policy'] = [policies.join(';')];
      callback({ responseHeaders });
    },
  );

  // Hiding rules and scriptlets go into the page from here; the preload only
  // reports the page's classes and ids.
  session.registerPreloadScript({
    type: 'frame',
    filePath: path.join(__dirname, 'content-preload.cjs'),
  });
  ipcMain.handle(
    INJECT_COSMETICS,
    (event: IpcMainInvokeEvent, _url: unknown, message: unknown) => {
      const contents = event.sender;
      if (!pageHandleFor(contents) || event.senderFrame?.parent) return;
      const url = contents.getURL();
      const features = message === undefined ? undefined : domFeatures(message);
      for (const blocker of blockersOn(url)) {
        const cosmetics = blocker.cosmeticsFor(url, features);
        if (!cosmetics) continue;
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
  ipcMain.handle(AUTOCONSENT, (event: IpcMainInvokeEvent, message: unknown) => {
    const frame = event.senderFrame;
    if (!frame || !pageHandleFor(event.sender)) return null;
    return autoconsentReply(message, {
      frameUrl: frame.url,
      isMainFrame: !frame.parent,
      enabled: handlesCookiesOn(event.sender.getURL()),
      evaluate: (code) => frame.executeJavaScript(code),
    });
  });

  // A failed download, or lists a week old, are fetched again later.
  for (const { blocker } of blockers) {
    void blocker.load().catch(() => undefined);
    setInterval(
      () => blocker.refreshIfStale().catch(() => undefined),
      RETRY_DELAY,
    );
  }

  return {
    blockedOn: (pageId) =>
      blockers.reduce((sum, { blocker }) => sum + blocker.blockedOn(pageId), 0),
    getStatus: () =>
      combinedStatus(blockers.map(({ blocker }) => blocker.getStatus())),
    update: async () => {
      await Promise.all(blockers.map(({ blocker }) => blocker.update()));
    },
  };
}
