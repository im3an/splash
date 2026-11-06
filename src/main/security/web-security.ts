import { app, systemPreferences, type Session } from 'electron';
import type { SitePermission } from '../../shared/types';
import { pageHandleFor } from '../browser/electron-page-host';
import {
  AUTO_GRANTED,
  resolvePermissionRequest,
  sitePermissionsFor,
  webOrigin,
  type PermissionDecisions,
} from './permissions';
import { webUserAgent } from './user-agent';

/** Web pages browse in their own persistent session, apart from the app shell. */
export const WEB_PARTITION = 'persist:web';

/** macOS also has to let Splash itself use the camera and microphone. */
async function systemAllows(permissions: SitePermission[]): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  for (const kind of ['camera', 'microphone'] as const) {
    if (!permissions.includes(kind)) continue;
    if (systemPreferences.getMediaAccessStatus(kind) === 'granted') continue;
    if (!(await systemPreferences.askForMediaAccess(kind))) return false;
  }
  return true;
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
          const allowed = granted && (await systemAllows(permissions));
          if (!allowed) target.blocked(permissions);
          callback(allowed);
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
