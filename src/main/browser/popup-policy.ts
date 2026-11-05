/** How long a click or key press may still open something; Chromium's own figure. */
const GESTURE_MS = 5000;

/**
 * Remembers the user's last click or key press in a page, so that opening a
 * window can be told apart from a script doing it on its own. As in Chromium,
 * one gesture opens one thing: a page can't turn a click into a burst.
 */
export class UserGestures {
  private at: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  record(): void {
    this.at = this.now();
  }

  /** Whether a recent gesture is still unspent, spending it if so. */
  consume(): boolean {
    const at = this.at;
    this.at = null;
    return at !== null && this.now() - at <= GESTURE_MS;
  }
}

/** Input that counts as the user asking for something. */
export function isGestureInput(type: string): boolean {
  return (
    type === 'mouseDown' ||
    type === 'rawKeyDown' ||
    type === 'keyDown' ||
    type === 'touchStart' ||
    type === 'gestureTap'
  );
}

export interface PopupRequest {
  url: string;
  disposition: string;
  /** The `window.open` features string; empty for links. */
  features: string;
  /** The user just clicked or pressed a key in the page. */
  gesture: boolean;
  /** The address is that of the link the user just clicked. */
  linkClick: boolean;
  /** This site's popup setting; `null` when the user hasn't chosen. */
  allowed: boolean | null;
}

/**
 * `page` joins the trail, `window` is a real popup that keeps its tie to the
 * opener (sign-in and payment flows report back through it), `block` opens
 * nothing and tells the user.
 */
export type PopupVerdict = 'page' | 'window' | 'block';

/** `window.open()` with no address, which the opener fills in afterwards. */
export function isBlankPopup(url: string): boolean {
  return url === '' || url === 'about:blank';
}

/**
 * By default only what the user asked for opens. Blocking a site goes
 * further, stopping scripts that open something on every click, but never
 * real links: ⌘-clicks say so by opening in the background.
 */
export function judgePopup(request: PopupRequest): PopupVerdict {
  const { allowed, gesture, linkClick, disposition } = request;
  const opens =
    allowed === true ||
    linkClick ||
    (gesture && (allowed === null || disposition === 'background-tab'));
  if (!opens) return 'block';
  if (isBlankPopup(request.url)) return 'window';
  // Shift-click also asks for a new window, but with no features: that's a
  // link, and links belong in the trail.
  return disposition === 'new-window' && request.features !== ''
    ? 'window'
    : 'page';
}
