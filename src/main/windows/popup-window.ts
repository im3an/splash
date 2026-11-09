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
      // The privacy preloads (cookies, autoplay, scripts) reach a popup's
      // frames only with this, as in a page. Sandboxed frames still get no Node.js.
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      navigateOnDragDrop: false,
    },
  };
}

/** What the network hooks can ask of a popup, which has no page of its own. */
export interface PopupHandle {
  /** Its main-frame request for `url` was stopped: reported as dangerous. */
  flaggedDangerous(url: string): void;
}

const popupHandles = new Map<number, PopupHandle>();

export function popupHandleFor(
  contents: { id: number } | null | undefined,
): PopupHandle | null {
  return (contents && popupHandles.get(contents.id)) ?? null;
}

/** The same limits a page has, for a window opened from one. */
export function wirePopupWindow(
  popup: BrowserWindow,
  openPage: (url: string) => void,
): void {
  const contents = popup.webContents;
  const gestures = new UserGestures();
  // A popup has nowhere to show the warning or "Continue anyway", so the address
  // moves to the trail, where the page shows both. A sign-in that uses it loses
  // its popup, which is the point.
  let moved = false;
  popupHandles.set(contents.id, {
    flaggedDangerous(url) {
      if (moved) return;
      moved = true;
      // Not inside the network hook that asked.
      setImmediate(() => {
        openPage(url);
        if (!popup.isDestroyed()) popup.close();
      });
    },
  });
  const id = contents.id;
  contents.on('destroyed', () => popupHandles.delete(id));
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
