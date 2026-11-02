import {
  BrowserWindow,
  WebContentsView,
  type Session,
  type WebContents,
} from 'electron';
import { contentBounds } from '../browser/layout';
import {
  aiProvider,
  type AiPanelAction,
  type AiPanelPlacement,
  type AiPanelState,
  type AiProviderId,
} from '../../shared/ai';
import { CONTENT_RADIUS } from '../../shared/geometry';

/**
 * Sign-in pages an assistant opens in a popup ("Continue with Google").
 * They stay in a small window of their own, on the same session, so the
 * sign-in lands back in the panel.
 */
const SIGN_IN_HOSTS = [
  'accounts.google.com',
  'appleid.apple.com',
  'login.live.com',
  'login.microsoftonline.com',
  'github.com',
  'auth.openai.com',
  'clerk.perplexity.ai',
];

/**
 * Quiet the assistant's own chrome so it sits in Splash like a sidebar:
 * thin overlay scrollbars and no rubber-band glow. Only properties every
 * site shares; nothing that depends on a provider's markup.
 */
const PANEL_CSS = `
  html { -webkit-font-smoothing: antialiased; overscroll-behavior: none; }
  ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
    background-color: rgb(128 128 128 / 0.35);
  }
  ::-webkit-scrollbar-thumb:hover { background-color: rgb(128 128 128 / 0.55); }
  ::-webkit-scrollbar-corner { background: transparent; }
`;

/** Assistants kept alive in the background, so switching back is instant. */
const KEEP_ALIVE = 2;

interface AiPanelOptions {
  window: BrowserWindow;
  session: Session;
  /** A link out of the assistant opens as a page in the trail. */
  openPage(url: string): void;
  onState(state: AiPanelState): void;
}

/**
 * The AI panel: an assistant's web app in a view to the right of the page,
 * placed where the shell draws the panel.
 */
export class AiPanel {
  private readonly views = new Map<AiProviderId, WebContentsView>();
  private readonly icons: Partial<Record<AiProviderId, string>> = {};
  private readonly failed = new Set<AiProviderId>();
  private current: AiProviderId | null = null;
  /** Distance from the window's top, right and bottom, and the panel's width. */
  private frame: {
    top: number;
    right: number;
    bottom: number;
    width: number;
  } | null = null;

  constructor(private readonly options: AiPanelOptions) {}

  /** Shows `placement`'s assistant where the shell put the panel, or closes it. */
  place(placement: AiPanelPlacement | null): void {
    if (!placement) {
      this.current = null;
      this.frame = null;
      this.sync();
      return;
    }
    const changed = placement.provider !== this.current;
    this.current = placement.provider;
    // The panel keeps its width as the window resizes; only its left edge
    // moves with the window's right one.
    const [windowWidth = 0] = this.options.window.getContentSize();
    const { top, right, bottom, left } = placement.insets;
    this.frame = {
      top,
      right,
      bottom,
      width: Math.max(0, windowWidth - left - right),
    };
    if (changed) this.viewFor(placement.provider);
    this.sync();
    if (changed) this.report();
  }

  /** The window changed size; the panel keeps its distance from each edge. */
  layout(): void {
    this.sync();
  }

  act(action: AiPanelAction): void {
    const provider = this.current;
    const view = provider && this.views.get(provider);
    if (!provider || !view) return;
    const contents = view.webContents;
    switch (action) {
      case 'back':
        if (contents.navigationHistory.canGoBack())
          contents.navigationHistory.goBack();
        break;
      case 'reload':
        this.failed.delete(provider);
        contents.reload();
        break;
      case 'home':
        this.failed.delete(provider);
        void contents.loadURL(aiProvider(provider).url).catch(() => undefined);
        break;
      case 'open-as-page': {
        const url = contents.getURL();
        if (/^https?:/.test(url)) this.options.openPage(url);
        break;
      }
    }
  }

  focus(): void {
    const view = this.current && this.views.get(this.current);
    view?.webContents.focus();
  }

  destroy(): void {
    for (const view of this.views.values()) this.release(view);
    this.views.clear();
  }

  private viewFor(provider: AiProviderId): WebContentsView {
    const existing = this.views.get(provider);
    if (existing) {
      // Most recently used last.
      this.views.delete(provider);
      this.views.set(provider, existing);
      return existing;
    }
    const view = new WebContentsView({
      webPreferences: {
        session: this.options.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        safeDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    view.setBorderRadius(CONTENT_RADIUS);
    view.setBackgroundColor('#00000000');
    this.wire(provider, view.webContents);
    this.views.set(provider, view);
    void view.webContents
      .loadURL(aiProvider(provider).url)
      .catch(() => undefined);
    // Past the limit, the assistant used longest ago is let go.
    while (this.views.size > KEEP_ALIVE) {
      const [oldest, view] = this.views.entries().next().value!;
      if (oldest === provider) break;
      this.views.delete(oldest);
      this.release(view);
    }
    return view;
  }

  private wire(provider: AiProviderId, contents: WebContents): void {
    const report = () => {
      if (provider === this.current) this.report();
    };
    contents.on('dom-ready', () => {
      void contents.insertCSS(PANEL_CSS).catch(() => undefined);
    });
    contents.on('did-start-loading', report);
    contents.on('did-stop-loading', report);
    contents.on('did-navigate', report);
    contents.on('did-navigate-in-page', report);
    contents.on('did-fail-load', (_event, code, _description, _url, isMain) => {
      // -3 is a navigation replaced by another one, not a failure.
      if (!isMain || code === -3) return;
      this.failed.add(provider);
      report();
    });
    contents.on('did-finish-load', () => {
      this.failed.delete(provider);
      report();
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
      const icon = favicons.find((url) => url.startsWith('https:'));
      if (!icon || this.icons[provider] === icon) return;
      this.icons[provider] = icon;
      report();
    });
    contents.setWindowOpenHandler(({ url, disposition }) => {
      const host = hostOf(url);
      // A sign-in popup stays with the assistant; anything else is a link
      // out, which belongs in the trail.
      if (
        disposition === 'new-window' &&
        host &&
        SIGN_IN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: this.options.window,
            width: 480,
            height: 640,
            show: true,
            autoHideMenuBar: true,
            webPreferences: {
              session: this.options.session,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
            },
          },
        };
      }
      if (/^https?:/.test(url)) this.options.openPage(url);
      return { action: 'deny' };
    });
    // Nothing but web addresses: no files, no other apps.
    contents.on('will-navigate', (event) => {
      if (!/^https?:/.test(event.url)) event.preventDefault();
    });
  }

  private sync(): void {
    const window = this.options.window;
    if (window.isDestroyed()) return;
    const [width = 0, height = 0] = window.getContentSize();
    const frame = this.frame;
    const bounds =
      frame &&
      contentBounds(
        { width, height },
        { ...frame, left: Math.max(0, width - frame.right - frame.width) },
      );
    for (const [provider, view] of this.views) {
      const shown = provider === this.current && bounds !== null;
      const attached = window.contentView.children.includes(view);
      if (shown) {
        if (!attached) window.contentView.addChildView(view);
        view.setBounds(bounds);
      } else if (attached) {
        window.contentView.removeChildView(view);
      }
    }
  }

  private report(): void {
    const provider = this.current;
    if (!provider) return;
    const contents = this.views.get(provider)?.webContents;
    this.options.onState({
      provider,
      isLoading: contents?.isLoading() ?? true,
      canGoBack: contents?.navigationHistory.canGoBack() ?? false,
      icons: { ...this.icons },
      failed: this.failed.has(provider),
    });
  }

  private release(view: WebContentsView): void {
    const window = this.options.window;
    if (!window.isDestroyed() && window.contentView.children.includes(view)) {
      window.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
