import { app, ipcMain, systemPreferences, type Session } from 'electron';
import { LOCATION_REFUSED } from '../../shared/page-bridge';
import type { SitePermission, SystemPermission } from '../../shared/types';
import { pageHandleFor } from '../browser/electron-page-host';
import {
  AUTO_GRANTED,
  isAllowedOnAny,
  refusedBySystem,
  resolvePermissionRequest,
  sitePermissionsFor,
  webOrigin,
  type PermissionDecisions,
} from './permissions';
import { webUserAgent } from './user-agent';

/** Web pages browse in their own persistent session, apart from the app shell. */
export const WEB_PARTITION = 'persist:web';

/** macOS also has to let Splash itself use the camera and microphone. */
function refusedByMacOS(permissions: SitePermission[]) {
  if (process.platform !== 'darwin') return Promise.resolve([]);
  return refusedBySystem(permissions, {
    status: (kind) => systemPreferences.getMediaAccessStatus(kind),
    ask: (kind) => systemPreferences.askForMediaAccess(kind),
  });
}

function isCapture(permission: SitePermission): boolean {
  return permission === 'camera' || permission === 'microphone';
}

/** Each session's answers, for what a page in it reports. */
const sessionDecisions = new WeakMap<Session, PermissionDecisions>();

/** A site that was allowed its location and still got refused: macOS did that. */
function listenForLocationRefusals(): void {
  if (ipcMain.listenerCount(LOCATION_REFUSED) > 0) return;
  ipcMain.on(LOCATION_REFUSED, (event) => {
    const decisions = sessionDecisions.get(event.sender.session);
    const target = pageHandleFor(event.sender);
    if (!decisions || !target) return;
    const urls = [event.senderFrame?.url, event.sender.getURL()];
    if (isAllowedOnAny(decisions, 'location', urls)) {
      target.refusedBySystem(['location']);
    }
  });
}

/**
 * Permission requests from pages: harmless ones are granted, decided ones
 * follow the user's earlier choice, undecided ones become a prompt on the
 * page, and everything else is refused and shown as blocked — never
 * silently.
 */
export function configureWebSession(
  session: Session,
  decisions: PermissionDecisions,
): void {
  session.setUserAgent(webUserAgent(session.getUserAgent()));
  sessionDecisions.set(session, decisions);
  listenForLocationRefusals();
  session.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      if (AUTO_GRANTED.has(permission)) {
        callback(true);
        return;
      }
      const target = pageHandleFor(contents);
      const mediaTypes =
        'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
      const permissions = sitePermissionsFor(permission, mediaTypes);
      const origin = webOrigin(details.requestingUrl);
      if (!permissions || !origin || !target) {
        callback(false);
        return;
      }
      resolvePermissionRequest(decisions, origin, permissions, (undecided) =>
        target.request(origin, undecided),
      )
        .then(async (granted) => {
          if (!granted) {
            target.blocked(permissions);
            callback(false);
            return;
          }
          const refused: SystemPermission[] = await refusedByMacOS(permissions);
          if (refused.length > 0) target.refusedBySystem(refused);
          else if (permissions.some(isCapture)) target.capturing();
          callback(refused.length === 0);
        })
        .catch(() => callback(false));
    },
  );
  session.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin, details) => {
      if (AUTO_GRANTED.has(permission)) return true;
      const mediaType =
        'mediaType' in details && details.mediaType ? [details.mediaType] : [];
      const permissions = sitePermissionsFor(permission, mediaType);
      const origin = webOrigin(requestingOrigin);
      return (
        permissions !== null &&
        origin !== null &&
        permissions.every(
          (needed) => decisions.getPermission(origin, needed) === true,
        )
      );
    },
  );
  session.setDevicePermissionHandler(() => false);
}

/** The shell UI is our own code and needs no web permissions at all. */
export function configureAppSession(session: Session): void {
  sessionDecisions.delete(session);
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
}

/**
 * Safe defaults for every WebContents the app ever creates. Page hosts and
 * the shell window tighten these further for their own contents.
 */
export function hardenAllWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
