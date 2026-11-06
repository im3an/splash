import type {
  BaseWindow,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Session,
} from 'electron';
import { isGestureInput, UserGestures } from '../browser/popup-policy';
import { isPageUrl, mayOpenFromPage } from '../browser/url';
import { popupFallback } from '../security/https-only';
import { requestAuthentication } from './auth-window';

/**
 * A popup has no address bar, so its title says where it really is rather
 * than what the page calls itself: a fake sign-in page can't pass as Google.
 */
export function popupTitle(url: string): string {
  try {
    const { protocol, host } = new URL(url);
    if (protocol === 'https:') return host;
    if (protocol === 'http:') return `Not secure · ${host}`;
  } catch {
    /* Not an address yet. */
  }
  return 'Popup';
}

/** Size comes from the features the page asked for, within reason. */
export function popupWindowOptions(
  parent: BaseWindow,
  session: Session,
): BrowserWindowConstructorOptions {
  return {
    parent,
    minWidth: 320,
    minHeight: 240,
    show: true,
    title: 'Popup',
    backgroundColor: '#ffffff',
    webPreferences: {
      session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      navigateOnDragDrop: false,
    },
  };
}

/** The same limits a page has, for a window opened from one. */
export function wirePopupWindow(
  popup: BrowserWindow,
  openPage: (url: string) => void,
): void {
  const contents = popup.webContents;
  const gestures = new UserGestures();
  const showAddress = () => {
    if (!popup.isDestroyed()) popup.setTitle(popupTitle(contents.getURL()));
  };
  popup.on('page-title-updated', (event) => event.preventDefault());
  contents.on('did-fail-load', (_event, code, _text, url, isMainFrame) => {
    if (!isMainFrame) return;
    const plain = popupFallback(url, code);
    if (plain) void contents.loadURL(plain).catch(() => undefined);
  });
  contents.on('did-navigate', showAddress);
  contents.on('did-navigate-in-page', showAddress);
  contents.on('input-event', (_event, input) => {
    if (isGestureInput(input.type)) gestures.record();
  });
  contents.on('will-navigate', (event) => {
    if (!isPageUrl(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (!isPageUrl(event.url)) event.preventDefault();
  });
  contents.on('login', (event, details, info, callback) => {
    event.preventDefault();
    requestAuthentication(popup, contents, details.url, info, callback);
  });
  // One popup is enough; anything further the user asks for joins the trail.
  contents.setWindowOpenHandler(({ url }) => {
    if (gestures.consume() && mayOpenFromPage(url)) openPage(url);
    return { action: 'deny' };
  });
}
