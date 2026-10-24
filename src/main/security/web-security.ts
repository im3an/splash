import { app, type Session } from 'electron';

/** Web pages browse in their own persistent session, apart from the app shell. */
export const WEB_PARTITION = 'persist:web';

/**
 * Permissions a page receives without asking. Everything else is denied until
 * a permission prompt exists.
 */
const GRANTED_WEB_PERMISSIONS = new Set<string>([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
]);

export function configureWebSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(GRANTED_WEB_PERMISSIONS.has(permission));
  });
  session.setPermissionCheckHandler((_contents, permission) =>
    GRANTED_WEB_PERMISSIONS.has(permission),
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
