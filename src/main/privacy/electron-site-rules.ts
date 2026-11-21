import { ipcMain, type Session } from 'electron';
import { PAGE_SETTINGS, type PageSettings } from '../../shared/page-bridge';
import type { SitePermission } from '../../shared/types';
import type { PreferencesService } from '../preferences';
import { webOrigin } from '../security/permissions';
import type { ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import { isThirdParty } from './site-rules';

/** What pages can check before asking, by the names the web uses. */
const WEB_PERMISSION_NAMES: readonly [SitePermission, string][] = [
  ['camera', 'camera'],
  ['microphone', 'microphone'],
  ['location', 'geolocation'],
  ['notifications', 'notifications'],
];

/** Each session's answer to a frame's question, behind Electron's one channel. */
const answering = new Map<
  Session,
  (frameUrl: string, topUrl: string) => PageSettings
>();
let listening = false;

function listenForFrames(): void {
  if (listening) return;
  listening = true;
  // A frame waits for this answer, so it must always get one.
  ipcMain.on(PAGE_SETTINGS, (event, frameUrl: unknown, isTop: unknown) => {
    try {
      const frame = typeof frameUrl === 'string' ? frameUrl : '';
      // The top frame's own address: its navigation may not have reached
      // this process yet, so the contents can still show the last page.
      const top = isTop === true ? frame : event.sender.getURL();
      event.returnValue =
        answering.get(event.sender.session)?.(frame, top) ?? null;
    } catch (error) {
      console.error('Could not read page settings', error);
      event.returnValue = null;
    }
  });
}

export interface SiteRules {
  /** Starts answering this session's frames. */
  install(): void;
  /** A private window's session is going away. */
  uninstall(): void;
}

/**
 * What the user decided about sites beyond ads, for what only a frame's own
 * preload can enforce. Requests are handled by the helper extension
 * (helper-extension.ts): no `session.webRequest` listener may be registered,
 * or uBlock Origin sees no requests.
 */
export function createSiteRules(
  session: Session,
  store: Pick<TrailStore, 'getPermission'>,
  preferences: PreferencesService,
  // Kept for callers; the helper extension checks the threat lists.
  _threats?: ThreatList,
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
  const settingsFor = (frameUrl: string, topUrl: string): PageSettings => ({
    privacySignal: preferences.get().privacySignal,
    blockCookies: isThirdParty(frameUrl, topUrl) && blocksThirdPartyOn(topUrl),
    blockAutoplay: blocks(topUrl, 'autoplay'),
    blockScripts: blocks(topUrl, 'javascript'),
    formAssist:
      preferences.get().passwordAutofill && webOrigin(frameUrl) !== null,
    blockPictureInPicture: blocks(topUrl, 'picture-in-picture'),
    undecided: WEB_PERMISSION_NAMES.filter(
      ([permission]) => decision(frameUrl, permission) === null,
    ).map(([, name]) => name),
  });

  return {
    install() {
      answering.set(session, settingsFor);
      listenForFrames();
    },
    uninstall() {
      answering.delete(session);
    },
  };
}
