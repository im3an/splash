import type { Session, WebContents } from 'electron';
import type { ContentBlockingStatus } from '../../shared/types';
import type { ExtensionHost } from '../extensions/extension-host';
import type { PreferencesService } from '../preferences';
import type { TrailStore } from '../storage/trail-store';
import { backgroundPageOf, extensionFrom } from './helper-extension';

/**
 * uBlock Origin does the blocking (see helper-extension.ts for why Splash has
 * no hooks of its own). What Splash shows about it — a page's blocked count,
 * whether a site is trusted, how old the filter lists are — comes from uBlock
 * Origin's own background page in each session, through `self.µBlock`, the
 * same calls its popup and dashboard make, so the two always agree.
 */
export const UBLOCK_FOLDER = 'ublock-origin';

/** How long a manual list update may take before Settings stops waiting. */
const UPDATE_LIMIT_MS = 120_000;

/** uBlock Origin's background page in a session, while it runs there. */
function pageIn(session: Session): WebContents | null {
  const extension = extensionFrom(session, UBLOCK_FOLDER);
  return extension ? backgroundPageOf(session, extension.id) : null;
}

/** uBlock Origin's page in a session, waiting a while for it to start. */
async function startedPageIn(
  session: Session,
  limitMs = 20_000,
): Promise<WebContents | null> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const page = pageIn(session);
    if (page && !page.isLoading()) return page;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Runs `code` in uBlock Origin's page; null when it isn't running. */
async function run<T>(session: Session, code: string): Promise<T | null> {
  const page = pageIn(session);
  if (!page) return null;
  try {
    return (await page.executeJavaScript(code)) as T;
  } catch (error) {
    console.error('Could not reach uBlock Origin', error);
    return null;
  }
}

/** Whether uBlock Origin is running in this session. */
export function ublockRunning(session: Session): boolean {
  return pageIn(session) !== null;
}

/** Requests uBlock Origin blocked since the page last started loading. */
export async function blockedOn(contents: WebContents): Promise<number> {
  const count = await run<number>(
    contents.session,
    `(() => {
      const store = self.µBlock?.pageStoreFromTabId(${contents.id});
      return store ? store.counts.blocked.any : 0;
    })()`,
  );
  return count ?? 0;
}

/**
 * Whether the site is on uBlock Origin's trusted list, where it blocks
 * nothing. Null when uBlock Origin isn't running in the session.
 */
export function trusted(
  session: Session,
  origin: string,
): Promise<boolean | null> {
  return run<boolean>(
    session,
    `self.µBlock.isReadyPromise.then(() =>
      self.µBlock.getNetFilteringSwitch(${JSON.stringify(`${origin}/`)}) === false)`,
  );
}

/** Trusts the site, or stops trusting it, as the popup's power button does. */
export async function setTrusted(
  session: Session,
  origin: string,
  trust: boolean,
): Promise<void> {
  await run(
    session,
    `self.µBlock.isReadyPromise.then(() => {
      self.µBlock.toggleNetFilteringSwitch(${JSON.stringify(`${origin}/`)}, '', ${!trust});
      return true;
    })`,
  );
}

/** How current the filter lists in use are. */
export async function listStatus(
  session: Session,
): Promise<ContentBlockingStatus> {
  const status = await run<ContentBlockingStatus>(
    session,
    `(async () => {
      const µb = self.µBlock;
      if (!µb || !µb.readyToFilter) {
        return { state: 'loading', updatedAt: null, updateFailed: false };
      }
      const io = (await import('/js/assets.js')).default;
      const assets = await io.metadata();
      const lists = µb.selectedFilterLists
        .map((key) => assets[key])
        .filter((entry) => entry && entry.content === 'filters' && entry.remoteURL);
      const times = lists.map((entry) => entry.writeTime || 0).filter((time) => time > 0);
      return {
        state: 'ready',
        updatedAt: times.length > 0 ? Math.min(...times) : null,
        updateFailed: lists.some((entry) => !!entry.lastError),
      };
    })()`,
  );
  return status ?? { state: 'failed', updatedAt: null, updateFailed: false };
}

/** Downloads newer filter lists now, and waits for the round to finish. */
export async function updateLists(session: Session): Promise<void> {
  await run(
    session,
    `(async () => {
      const µb = self.µBlock;
      await µb.isReadyPromise;
      const io = (await import('/js/assets.js')).default;
      await new Promise((resolve) => {
        const done = (topic) => {
          if (topic !== 'after-assets-updated') return;
          io.removeObserver(done);
          resolve();
        };
        io.addObserver(done);
        setTimeout(() => { io.removeObserver(done); resolve(); }, ${UPDATE_LIMIT_MS});
        µb.scheduleAssetUpdater({ now: true, fetchDelay: 100, auto: true });
      });
      return true;
    })()`,
  );
}

/** Copies one session's trusted sites into another, as a private window opens. */
export async function copyTrustedSites(
  from: Session,
  to: Session,
): Promise<void> {
  const list = await run<string>(
    from,
    `self.µBlock.isReadyPromise.then(() =>
      self.µBlock.stringFromWhitelist(self.µBlock.netWhitelist))`,
  );
  if (!list || !(await startedPageIn(to))) return;
  await run(
    to,
    `self.µBlock.isReadyPromise.then(() => {
      self.µBlock.netWhitelist = self.µBlock.whitelistFromString(${JSON.stringify(list)});
      self.µBlock.saveWhitelist();
      return true;
    })`,
  );
}

/** Marks that Splash's own "ads" decisions were handed to uBlock Origin. */
const MIGRATED_KEY = 'ublock:took-over-blocking';

/**
 * "Block ads and trackers" is uBlock Origin being on: turning one off turns
 * the other off, whichever the user used (Settings, or the Extensions list).
 * The first launch with uBlock Origin in charge also moves the sites Splash
 * was told to allow ads on into uBlock Origin's trusted list, and keeps the
 * setting the user had.
 */
export async function keepBlockingInStep(options: {
  session: Session;
  extensions: Pick<
    ExtensionHost,
    'bundledExtension' | 'list' | 'onChange' | 'setEnabled'
  >;
  preferences: PreferencesService;
  store: Pick<
    TrailStore,
    'getPreference' | 'setPreference' | 'listPermissions' | 'setPermission'
  >;
}): Promise<void> {
  const { session, extensions, preferences, store } = options;
  const ublock = () =>
    extensions
      .list()
      .find(
        (extension) =>
          extension.source === 'bundled' &&
          extension.name.startsWith('uBlock Origin'),
      ) ?? null;
  const setOn = async (on: boolean) => {
    const extension = ublock();
    if (!extension || extension.enabled === on) return;
    await extensions
      .setEnabled(extension.id, on)
      .catch((error: unknown) =>
        console.error('Could not turn uBlock Origin on or off', error),
      );
  };

  if (store.getPreference(MIGRATED_KEY) === null) {
    if (!preferences.get().blockAds) await setOn(false);
    const allowed = store
      .listPermissions()
      .filter((record) => record.permission === 'ads');
    if (allowed.length > 0 && (await startedPageIn(session))) {
      for (const record of allowed) {
        if (record.granted) await setTrusted(session, record.origin, true);
        store.setPermission(record.origin, 'ads', null);
      }
    }
    store.setPreference(MIGRATED_KEY, '1');
  }
  // uBlock Origin's state wins at launch: it's what is running.
  const sync = () => {
    const extension = ublock();
    if (extension && extension.enabled !== preferences.get().blockAds) {
      preferences.update({ blockAds: extension.enabled });
    }
  };
  sync();
  extensions.onChange(sync);
  preferences.onChange((changed) => {
    if (ublock()?.enabled !== changed.blockAds) void setOn(changed.blockAds);
  });
}
