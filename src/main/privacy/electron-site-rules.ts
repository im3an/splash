import { ipcMain, webContents, type Session } from 'electron';
import { PAGE_SETTINGS, type PageSettings } from '../../shared/page-bridge';
import type { SitePermission } from '../../shared/types';
import type { PreferencesService } from '../preferences';
import { webOrigin } from '../security/permissions';
import { dangerousSiteKey, type ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import {
  contentPolicyFor,
  isThirdParty,
  withoutCookie,
  withPrivacySignal,
} from './site-rules';

/** What pages can check before asking, by the names the web uses. */
const WEB_PERMISSION_NAMES: readonly [SitePermission, string][] = [
  ['camera', 'camera'],
  ['microphone', 'microphone'],
  ['location', 'geolocation'],
  ['notifications', 'notifications'],
];

interface RequestDetails {
  url: string;
  resourceType: string;
  webContentsId?: number;
  referrer: string;
}

export interface SiteRules {
  /** Registers the hooks; the content blocker calls it alongside its own. */
  install(): void;
  /** Whether a page's address is reported as dangerous and not yet accepted. */
  isDangerous(url: string): boolean;
  /** What a response must have changed. Electron allows one listener for it. */
  forResponse(details: RequestDetails): {
    contentPolicy: string | null;
    dropCookies: boolean;
  };
}

/**
 * What the user decided about sites beyond ads: enforced on requests here,
 * and in a frame's own preload for what only the page can see.
 */
export function createSiteRules(
  session: Session,
  store: Pick<TrailStore, 'getPermission'>,
  preferences: PreferencesService,
  threats: ThreatList,
): SiteRules {
  const decision = (url: string, permission: SitePermission) => {
    const origin = webOrigin(url);
    if (!origin) return null;
    try {
      return store.getPermission(origin, permission);
    } catch (error) {
      console.error('Storage error', error);
      return null;
    }
  };
  const blocks = (url: string, permission: SitePermission) =>
    decision(url, permission) === false;
  /** Whether a page at `topUrl` keeps other sites' cookies out. */
  const blocksThirdPartyOn = (topUrl: string) => {
    const decided = decision(topUrl, 'third-party-cookies');
    return decided === null
      ? preferences.get().blockThirdPartyCookies
      : !decided;
  };
  /** The page a request belongs to, whichever frame or worker made it. */
  const topOf = ({ webContentsId, referrer }: RequestDetails) => {
    const contents =
      webContentsId === undefined
        ? undefined
        : webContents.fromId(webContentsId);
    return contents?.getURL() || referrer;
  };
  const isBlockedThirdParty = (details: RequestDetails) => {
    if (details.resourceType === 'mainFrame') return false;
    const top = topOf(details);
    return isThirdParty(details.url, top) && blocksThirdPartyOn(top);
  };

  const settingsFor = (frameUrl: string, topUrl: string): PageSettings => ({
    privacySignal: preferences.get().privacySignal,
    blockCookies: isThirdParty(frameUrl, topUrl) && blocksThirdPartyOn(topUrl),
    blockAutoplay: blocks(topUrl, 'autoplay'),
    blockScripts: blocks(topUrl, 'javascript'),
    undecided: WEB_PERMISSION_NAMES.filter(
      ([permission]) => decision(frameUrl, permission) === null,
    ).map(([, name]) => name),
  });

  return {
    isDangerous(url) {
      if (!preferences.get().warnDangerousSites) return false;
      const key = dangerousSiteKey(url);
      if (!key || !threats.isListed(new URL(key).hostname)) return false;
      return decision(key, 'dangerous') !== true;
    },
    install() {
      session.webRequest.onBeforeSendHeaders(
        { urls: ['<all_urls>'] },
        (details, callback) => {
          let { requestHeaders } = details;
          if (preferences.get().privacySignal)
            requestHeaders = withPrivacySignal(requestHeaders);
          if (isBlockedThirdParty(details))
            requestHeaders = withoutCookie(requestHeaders);
          callback({ requestHeaders });
        },
      );
      // A frame waits for this answer, so it must always get one.
      ipcMain.on(PAGE_SETTINGS, (event, frameUrl: unknown, isTop: unknown) => {
        try {
          const frame = typeof frameUrl === 'string' ? frameUrl : '';
          // The top frame's own address: its navigation may not have reached
          // this process yet, so the contents can still show the last page.
          const top = isTop === true ? frame : event.sender.getURL();
          event.returnValue =
            event.sender.session === session ? settingsFor(frame, top) : null;
        } catch (error) {
          console.error('Could not read page settings', error);
          event.returnValue = null;
        }
      });
    },
    forResponse(details) {
      const isDocument =
        details.resourceType === 'mainFrame' ||
        details.resourceType === 'subFrame';
      const top =
        details.resourceType === 'mainFrame' ? details.url : topOf(details);
      return {
        contentPolicy: isDocument
          ? contentPolicyFor({
              scripts: blocks(top, 'javascript'),
              images: blocks(top, 'images'),
            })
          : null,
        dropCookies: isBlockedThirdParty(details),
      };
    },
  };
}
