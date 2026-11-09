import path from 'node:path';
import {
  BrowserWindow,
  nativeTheme,
  screen,
  type BaseWindow,
  type Rectangle,
} from 'electron';
import { eventChannels } from '../../shared/api';
import { DEFAULT_APPEARANCE, frameColor } from '../../shared/appearance';
import type { AutofillItem, AutofillMessage } from '../../shared/vault';
import type { IpcTarget } from '../ipc/register-ipc';
import { isSameDocument, shellUrl } from './shell-url';

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;
const GAP = 4;

/** Where the menu goes: under the field, or above it near the screen's foot. */
export function menuBounds(
  anchor: Rectangle,
  height: number,
  area: Rectangle,
): Rectangle {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, anchor.width));
  const below = anchor.y + anchor.height + GAP;
  const y =
    below + height <= area.y + area.height
      ? below
      : Math.max(area.y, anchor.y - GAP - height);
  const x = Math.max(area.x, Math.min(anchor.x, area.x + area.width - width));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * The menu under a form field. It's a window of its own rather than part of
 * the page, so a page can't read, restyle or cover what's offered, and it never
 * takes focus, so the field keeps its caret and keeps getting the arrow keys.
 */
export class AutofillMenu {
  private window: BrowserWindow | null = null;
  private readonly url = `${shellUrl()}#autofill`;
  private items: AutofillItem[] = [];
  private anchor: Rectangle | null = null;
  private parent: BaseWindow | null = null;
  private readonly hideNow = () => this.onLost();

  constructor(
    private readonly events: {
      choose(id: string): void | Promise<void>;
      /** Something other than a choice closed it. */
      lost(): void;
    },
  ) {}

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const window = new BrowserWindow({
      show: false,
      frame: false,
      type: 'panel',
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      acceptFirstMouse: true,
      width: MIN_WIDTH,
      height: 44,
      backgroundColor: frameColor(
        DEFAULT_APPEARANCE,
        nativeTheme.shouldUseDarkColors,
      ),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    window.setWindowButtonVisibility?.(false);
    window.webContents.on('will-navigate', (event) => {
      if (!isSameDocument(event.url, this.url)) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    void window.loadURL(this.url);
    this.window = window;
    return window;
  }

  /** The contents, for the IPC resolver to know where a call came from. */
  owns(contents: Electron.WebContents): boolean {
    return this.window?.webContents === contents;
  }

  private send(message: AutofillMessage): void {
    const contents = this.window?.webContents;
    if (contents && !contents.isLoading()) {
      contents.send(eventChannels.autofill, message);
    }
  }

  /** Waits for the shell to say how tall these rows are before appearing. */
  show(parent: BaseWindow, anchor: Rectangle, items: AutofillItem[]): void {
    const window = this.ensureWindow();
    this.follow(parent);
    if (!window.getParentWindow()) {
      window.setParentWindow(parent as BrowserWindow);
    } else if (window.getParentWindow() !== parent) {
      window.setParentWindow(null);
      window.setParentWindow(parent as BrowserWindow);
    }
    this.anchor = anchor;
    this.items = items;
    this.send({ type: 'show', items });
  }

  hide(): void {
    this.anchor = null;
    this.items = [];
    this.follow(null);
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  key(key: 'up' | 'down' | 'enter'): void {
    this.send({ type: 'key', key });
  }

  private place(height: number): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.anchor) return;
    const { workArea } = screen.getDisplayMatching(this.anchor);
    window.setBounds(menuBounds(this.anchor, height, workArea));
    if (!window.isVisible()) window.showInactive();
  }

  /** Leaves with the window it's anchored to, if that moves or loses focus. */
  private follow(parent: BaseWindow | null): void {
    if (this.parent === parent) return;
    if (this.parent && !this.parent.isDestroyed()) {
      for (const event of ['blur', 'move', 'resize', 'closed'] as const) {
        this.parent.off(event as 'blur', this.hideNow);
      }
    }
    this.parent = parent;
    if (parent) {
      for (const event of ['blur', 'move', 'resize', 'closed'] as const) {
        parent.on(event as 'blur', this.hideNow);
      }
    }
  }

  private onLost(): void {
    this.hide();
    this.events.lost();
  }

  readonly ipc: IpcTarget = {
    isShellUrl: (candidate) => isSameDocument(candidate, this.url),
    invoke: {
      'autofill:current': () => this.items,
      'autofill:choose': ({ id }) => this.events.choose(id),
    },
    send: {
      'autofill:resize': ({ height }) => {
        if (height > 0) this.place(height);
      },
    },
  };

  destroy(): void {
    this.follow(null);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
