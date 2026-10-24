import {
  WebContentsView,
  type BaseWindow,
  type Rectangle,
  type Session,
  type WebContents,
} from 'electron';
import type {
  PageHost,
  PageHostEvents,
  PageHostFactory,
} from '../../engine/page-host';
import { isNavigableUrl } from '../../engine/url';

/** Must match `--radius-content` in the renderer's design tokens. */
const CONTENT_RADIUS = 10;
/** Chromium's ERR_ABORTED: a load was superseded by another navigation. */
const ERR_ABORTED = -3;

function isFaviconUrl(url: string): boolean {
  return isNavigableUrl(url) || url.startsWith('data:image/');
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** A page rendered by Chromium in a `WebContentsView` inside the window. */
class ElectronPageHost implements PageHost {
  private readonly view: WebContentsView;
  private attached = false;
  private origin: string | null = null;

  constructor(
    private readonly window: BaseWindow,
    session: Session,
    private readonly events: PageHostEvents,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        session,
        // Web content never gets Node.js or a preload bridge.
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        safeDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    this.view.setBorderRadius(CONTENT_RADIUS);
    this.view.setBackgroundColor('#ffffff');
    this.wire(this.view.webContents);
  }

  private get contents(): WebContents {
    return this.view.webContents;
  }

  load(url: string): void {
    // Failures surface through `did-fail-load`; the promise only duplicates them.
    this.contents.loadURL(url).catch(() => undefined);
  }

  goBack(): void {
    if (this.contents.navigationHistory.canGoBack()) {
      this.contents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.contents.navigationHistory.canGoForward()) {
      this.contents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.contents.reload();
  }

  stop(): void {
    this.contents.stop();
  }

  show(bounds: Rectangle): void {
    if (!this.attached) {
      this.window.contentView.addChildView(this.view);
      this.attached = true;
    }
    this.view.setBounds(bounds);
  }

  hide(): void {
    if (!this.attached) return;
    this.attached = false;
    // A closed window has already released its child views.
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
    }
  }

  focus(): void {
    this.contents.focus();
  }

  toggleDevTools(): void {
    this.contents.toggleDevTools();
  }

  destroy(): void {
    this.hide();
    // A WebContentsView does not destroy its WebContents on its own.
    if (!this.contents.isDestroyed()) this.contents.close();
  }

  private navigationState() {
    const history = this.contents.navigationHistory;
    return {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    };
  }

  private wire(contents: WebContents): void {
    const emit = this.events.onStateChange;

    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (isNavigableUrl(url)) {
        this.events.onOpenRequest(url, {
          background: disposition === 'background-tab',
        });
      }
      // The trail creates its own page instead of an Electron window.
      return { action: 'deny' };
    });

    const blockUnsafeNavigation = (event: Electron.Event<{ url: string }>) => {
      if (!isNavigableUrl(event.url)) event.preventDefault();
    };
    contents.on('will-navigate', blockUnsafeNavigation);
    contents.on('will-redirect', blockUnsafeNavigation);

    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) emit({ error: null });
    });
    contents.on('did-start-loading', () => emit({ isLoading: true }));
    contents.on('did-stop-loading', () =>
      emit({ isLoading: false, ...this.navigationState() }),
    );
    contents.on('did-navigate', (_event, url) => {
      const origin = originOf(url);
      const leftSite = origin !== this.origin;
      this.origin = origin;
      emit({
        url,
        ...this.navigationState(),
        // The previous site's icon must not linger on a different site.
        ...(leftSite ? { faviconUrl: null } : {}),
      });
    });
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) emit({ url, ...this.navigationState() });
    });
    contents.on('page-title-updated', (_event, title) => emit({ title }));
    contents.on('page-favicon-updated', (_event, favicons) => {
      emit({ faviconUrl: favicons.find(isFaviconUrl) ?? null });
    });
    contents.on(
      'did-fail-load',
      (_event, code, description, url, isMainFrame) => {
        if (!isMainFrame || code === ERR_ABORTED) return;
        emit({
          isLoading: false,
          error: { kind: 'load-failed', code, description, url },
        });
      },
    );
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      emit({
        isLoading: false,
        error: {
          kind: 'crashed',
          code: details.exitCode,
          description: details.reason,
          url: contents.getURL(),
        },
      });
    });
  }
}

export function createElectronPageHostFactory(
  window: BaseWindow,
  session: Session,
): PageHostFactory {
  return (events) => new ElectronPageHost(window, session, events);
}
