import { requestAuthentication } from '../windows/auth-window';
import {
  Menu,
  dialog,
  webContents,
  WebContentsView,
  type BaseWindow,
  type ContextMenuParams,
  type MenuItem,
  type Rectangle,
  type Session,
  type WebContents,
} from 'electron';
import {
  BRANCH_LINK,
  FORM_EDITED,
  LINK_ACTIVATED,
  NAVIGATION_BUTTON,
} from '../../shared/page-bridge';
import type { ExternalApp, Notice, SitePermission } from '../../shared/types';
import { webContextMenu } from '../menus/web-context-menu';
import { isSameDocumentUrl, LinkActivations } from './link-activations';
import type {
  LoadOptions,
  PageHistory,
  PageHost,
  PageHostEvents,
  PageHostFactory,
} from './page-host';
import {
  isExternalAppUrl,
  isNavigableUrl,
  isPageUrl,
  mayOpenFromPage,
} from './url';
import { requestPageClose } from './close-page';
import { stepZoom } from './zoom';
import { CONTENT_RADIUS } from '../../shared/geometry';

/** Chromium's ERR_ABORTED: a load was superseded by another navigation. */
const ERR_ABORTED = -3;
const MAX_URL_LENGTH = 8192;

export interface PageHostEnvironment {
  window: BaseWindow;
  session: Session;
  /** The isolated-world script that reports link clicks. */
  preload: string;
  /** Whether the user turned sound off for a site. */
  isSoundBlocked(origin: string): boolean;
  /** A page's contents were created; extensions can now see it. */
  onContentsCreated?(contents: WebContents): void;
  /** A page's link wants another app (mailto:, tel:): ask, then open it. */
  openExternal?(contents: WebContents, url: string): void;
  /** Extension items for a page's context menu, such as "Block element". */
  extensionMenuItems?(
    contents: WebContents,
    params: ContextMenuParams,
  ): MenuItem[];
}

/**
 * A trail page as session-wide handlers see it: where its permission
 * requests go and which page its downloads belong to.
 */
export interface PageHandle {
  pageId: string;
  request(
    origin: string,
    permissions: SitePermission[],
    opens?: ExternalApp,
  ): Promise<boolean>;
  blocked(permissions: SitePermission[]): void;
  notify(notice: Notice): void;
}

const pageHandles = new Map<number, PageHandle>();

/** The contents showing a trail page, while it is awake. */
export function contentsForPage(pageId: string): WebContents | undefined {
  for (const [id, handle] of pageHandles) {
    if (handle.pageId !== pageId) continue;
    const contents = webContents.fromId(id);
    if (contents && !contents.isDestroyed()) return contents;
  }
  return undefined;
}

/** The trail page behind a WebContents, if it is one of ours. */
export function pageHandleFor(
  contents: WebContents | null | undefined,
): PageHandle | undefined {
  return contents ? pageHandles.get(contents.id) : undefined;
}

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
  /** The view releases its getter on native close; retain the lifecycle object. */
  private readonly nativeContents: WebContents;
  private readonly window: BaseWindow;
  private readonly environment: PageHostEnvironment;
  private readonly links = new LinkActivations();
  private attached = false;
  private closing = false;
  private hasFormEdits = false;
  private origin: string | null = null;
  private sourceUrl: string | null = null;

  constructor(
    environment: PageHostEnvironment,
    private readonly events: PageHostEvents,
  ) {
    this.window = environment.window;
    this.environment = environment;
    this.view = new WebContentsView({
      webPreferences: {
        session: environment.session,
        // Web content never gets Node.js. Its preload runs in an isolated
        // world and can only report link clicks.
        preload: environment.preload,
        sandbox: true,
        // Despite the name, sandboxed frames still get no Node.js: this only
        // runs the preloads in iframes too, where cookie banners often live.
        nodeIntegrationInSubFrames: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        safeDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    this.nativeContents = this.view.webContents;
    this.view.setBorderRadius(CONTENT_RADIUS);
    this.view.setBackgroundColor('#ffffff');
    this.wire(this.view.webContents);
    const id = this.view.webContents.id;
    pageHandles.set(id, {
      pageId: events.pageId,
      request: (origin, permissions, opens) =>
        this.events.onPermissionRequest(origin, permissions, opens),
      blocked: (permissions) => this.events.onPermissionBlocked(permissions),
      notify: (notice) => this.events.onNotice(notice),
    });
    this.view.webContents.once('destroyed', () => pageHandles.delete(id));
    environment.onContentsCreated?.(this.view.webContents);
  }

  private get contents(): WebContents {
    return this.nativeContents;
  }

  load(url: string, options: LoadOptions = {}): void {
    this.sourceUrl = url.startsWith('view-source:') ? url : null;
    const httpReferrer = options.referrer
      ? {
          url: options.referrer,
          policy: 'strict-origin-when-cross-origin' as const,
        }
      : undefined;
    // Failures surface through `did-fail-load`; the promise only duplicates them.
    this.contents.loadURL(url, { httpReferrer }).catch(() => undefined);
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

  reload({ ignoreCache = false }: { ignoreCache?: boolean } = {}): void {
    if (ignoreCache) this.contents.reloadIgnoringCache();
    else this.contents.reload();
  }

  stop(): void {
    this.contents.stop();
  }

  print(): void {
    this.contents.print({}, () => undefined);
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

  captureHistory(): PageHistory | null {
    const history = this.contents.navigationHistory;
    const entries = history
      .getAllEntries()
      .filter((entry) => isPageUrl(entry.url));
    if (entries.length === 0) return null;
    const index = Math.min(history.getActiveIndex(), entries.length - 1);
    if (this.sourceUrl && entries[index])
      entries[index] = { ...entries[index]!, url: this.sourceUrl };
    return { entries, index: Math.max(0, index) };
  }

  restoreHistory(history: PageHistory): void {
    const active = history.entries[history.index]?.url;
    if (active?.startsWith('view-source:')) {
      this.load(active);
      return;
    }
    this.contents.navigationHistory
      .restore({ entries: history.entries, index: history.index })
      .catch(() => {
        if (!this.contents.isDestroyed() && active && isPageUrl(active))
          this.load(active);
      });
  }

  isAudible(): boolean {
    return this.contents.isCurrentlyAudible();
  }

  setMuted(muted: boolean): void {
    this.contents.setAudioMuted(muted);
    this.events.onStateChange({ isMuted: muted });
  }

  setZoomPercent(percent: number): void {
    this.contents.setZoomFactor(percent / 100);
    this.events.onStateChange({ zoomPercent: percent });
  }

  find(text: string, options: { forward: boolean; findNext: boolean }): void {
    if (text === '') {
      this.stopFind();
      this.events.onStateChange({ find: { activeMatch: 0, matches: 0 } });
      return;
    }
    this.contents.findInPage(text, options);
  }

  stopFind(): void {
    this.contents.stopFindInPage('keepSelection');
    this.events.onStateChange({ find: null });
  }

  async capture(): Promise<string | null> {
    try {
      const image = await this.contents.capturePage();
      if (image.isEmpty()) return null;
      return `data:image/jpeg;base64,${image.toJPEG(82).toString('base64')}`;
    } catch {
      return null;
    }
  }

  private allowLeave(reason: 'unsaved' | 'unresponsive' | 'edited'): boolean {
    const url = this.contents.isDestroyed() ? '' : this.contents.getURL();
    let host = 'This page';
    try {
      host = new URL(url).host;
    } catch {
      /* Blank or crashed page. */
    }
    return (
      dialog.showMessageBoxSync(this.window, {
        type: 'warning',
        message:
          reason !== 'unresponsive'
            ? `Leave ${host}?`
            : `${host} isn’t responding.`,
        detail:
          reason === 'edited'
            ? 'You edited fields on this page. Some sites save automatically. Leave only if your work is saved, or if you want to discard it.'
            : reason === 'unsaved'
              ? 'The site says you may have unsaved changes. Leaving can discard what you entered.'
              : 'You can keep this page open and wait, or force it to close. Unsaved changes may be lost.',
        buttons:
          reason !== 'unresponsive'
            ? ['Stay on Page', 'Leave Page']
            : ['Keep Page Open', 'Force Close'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }) === 1
    );
  }

  async requestClose(): Promise<boolean> {
    const edited = this.hasFormEdits;
    if (edited && !this.allowLeave('edited')) return false;
    this.closing = true;
    try {
      return await requestPageClose(this.contents, (reason) =>
        reason === 'unsaved' && edited ? true : this.allowLeave(reason),
      );
    } finally {
      this.closing = false;
    }
  }

  destroy(): void {
    // Forget the page now: `destroyed` comes later, and until then a sleeping
    // page would still seem to have this view.
    if (!this.contents.isDestroyed()) pageHandles.delete(this.contents.id);
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
      if (isExternalAppUrl(url)) {
        this.environment.openExternal?.(contents, url);
      } else if (mayOpenFromPage(url)) {
        this.events.onOpenRequest(url, {
          background: disposition === 'background-tab',
        });
      }
      // The trail creates its own page instead of an Electron window.
      return { action: 'deny' };
    });

    contents.ipc.on(FORM_EDITED, (event, edited: unknown) => {
      if (!event.senderFrame || edited !== true) return;
      this.hasFormEdits = true;
      emit({ hasFormEdits: true });
    });
    contents.ipc.on(LINK_ACTIVATED, (event, href: unknown) => {
      if (event.senderFrame?.parent !== null) return;
      if (typeof href !== 'string' || href.length > MAX_URL_LENGTH) return;
      if (isNavigableUrl(href)) this.links.record(href);
    });
    contents.ipc.on(BRANCH_LINK, (event, href: unknown) => {
      if (
        event.senderFrame?.parent !== null ||
        typeof href !== 'string' ||
        href.length > MAX_URL_LENGTH ||
        !isNavigableUrl(href)
      )
        return;
      const current = contents.getURL();
      if (this.links.take(href) && !isSameDocumentUrl(href, current))
        this.events.onBranchRequest(href, current);
    });
    // Any frame may report it: the button works over embedded content too.
    contents.ipc.on(NAVIGATION_BUTTON, (_event, button: unknown) => {
      if (button === 'back' || button === 'forward') {
        this.events.onNavigationCommand(button);
      }
    });

    contents.on('will-navigate', (event) => {
      if (!isPageUrl(event.url)) {
        event.preventDefault();
        // mailto:, tel: and the like: never silently dropped, never opened
        // without asking. Only the user's own clicks in the top frame.
        if (event.isMainFrame && isExternalAppUrl(event.url)) {
          this.environment.openExternal?.(contents, event.url);
        }
        return;
      }
      if (!event.isMainFrame || event.isSameDocument) return;
      if (this.sourceUrl && isNavigableUrl(event.url)) {
        event.preventDefault();
        this.events.onBranchRequest(event.url, this.sourceUrl.slice(12));
        return;
      }
      if (this.sourceUrl && event.url.startsWith('view-source:'))
        this.sourceUrl = event.url;
      const current = contents.getURL();
      // Only a link the user just clicked, leading to another document,
      // grows the trail. Everything else navigates in place.
      if (
        !this.links.take(event.url) ||
        isSameDocumentUrl(event.url, current)
      ) {
        return;
      }
      event.preventDefault();
      this.events.onBranchRequest(event.url, current);
    });
    contents.on('context-menu', (_event, params) => {
      const template = webContextMenu(contents, params, {
        ...this.events.navigationAvailability(),
        openChild: (url, options) => this.events.onOpenRequest(url, options),
        back: () => this.events.onNavigationCommand('back'),
        forward: () => this.events.onNavigationCommand('forward'),
        reload: () => this.events.onNavigationCommand('reload'),
        copied: (what, subject) =>
          this.events.onNotice({ kind: 'copied', what, subject }),
        print: () => this.print(),
      });
      const extras =
        this.environment.extensionMenuItems?.(contents, params) ?? [];
      // Extension items go just above Inspect Element.
      const items =
        extras.length > 0
          ? [
              ...template.slice(0, -1),
              ...extras,
              { type: 'separator' as const },
              ...template.slice(-1),
            ]
          : template;
      Menu.buildFromTemplate(items).popup({
        window: this.window,
        frame: params.frame ?? undefined,
      });
    });
    contents.on('will-redirect', (event) => {
      if (!isPageUrl(event.url)) event.preventDefault();
    });

    contents.on('login', (event, details, info, callback) => {
      event.preventDefault();
      requestAuthentication(this.window, contents, details.url, info, callback);
    });

    contents.on('will-prevent-unload', (event) => {
      if (this.closing) return;
      if (this.allowLeave('unsaved')) event.preventDefault();
      else {
        // Address-bar navigation is optimistic. A site veto must restore
        // the committed address instead of labelling the old form as the target.
        emit({
          url: this.sourceUrl ?? contents.getURL(),
          isLoading: false,
          error: null,
          ...this.navigationState(),
        });
      }
    });

    contents.on('focus', () => this.events.onFocus());

    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) emit({ error: null });
    });
    contents.on('did-start-loading', () => emit({ isLoading: true }));
    contents.on('did-stop-loading', () =>
      emit({ isLoading: false, ...this.navigationState() }),
    );
    contents.on('did-navigate', (_event, committed) => {
      this.hasFormEdits = false;
      emit({ hasFormEdits: false });
      const url = this.sourceUrl ?? committed;
      const origin = originOf(url);
      const leftSite = origin !== this.origin;
      this.origin = origin;
      if (leftSite && origin && this.environment.isSoundBlocked(origin)) {
        this.setMuted(true);
      }
      emit({
        url,
        ...(this.sourceUrl
          ? { title: `Source · ${new URL(this.sourceUrl.slice(12)).host}` }
          : {}),
        ...this.navigationState(),
        zoomPercent: Math.round(contents.getZoomFactor() * 100),
        find: null,
        // The previous site's icon must not linger on a different site.
        ...(leftSite ? { faviconUrl: null } : {}),
      });
    });
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) emit({ url, ...this.navigationState() });
    });
    contents.on('page-title-updated', (_event, title) =>
      emit({
        title: this.sourceUrl
          ? `Source · ${new URL(this.sourceUrl.slice(12)).host}`
          : title,
      }),
    );
    contents.on('audio-state-changed', (event) =>
      emit({ isAudible: event.audible }),
    );
    contents.on('found-in-page', (_event, result) =>
      emit({
        find: {
          activeMatch: result.activeMatchOrdinal,
          matches: result.matches,
        },
      }),
    );
    // Pinch and ⌘-scroll only ask for a zoom; applying it is up to us.
    contents.on('zoom-changed', (_event, direction) => {
      const current = Math.round(contents.getZoomFactor() * 100);
      this.setZoomPercent(stepZoom(current, direction));
    });
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
    // A video's full screen fills the whole window, edge to edge.
    contents.on('enter-html-full-screen', () => {
      this.view.setBorderRadius(0);
      this.events.onFullscreenChange(true);
    });
    contents.on('leave-html-full-screen', () => {
      this.view.setBorderRadius(CONTENT_RADIUS);
      this.events.onFullscreenChange(false);
    });
    contents.on('unresponsive', () => emit({ isUnresponsive: true }));
    contents.on('responsive', () => emit({ isUnresponsive: false }));
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      emit({
        isLoading: false,
        isUnresponsive: false,
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
  environment: PageHostEnvironment,
): PageHostFactory {
  return (events) => new ElectronPageHost(environment, events);
}
