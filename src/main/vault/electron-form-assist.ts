import {
  BrowserWindow,
  ipcMain,
  screen,
  webContents,
  type BaseWindow,
  type Rectangle,
  type Session,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import { z } from 'zod';
import {
  FORM_ASK,
  FORM_CLOSED,
  FORM_DISMISS,
  FORM_FILL,
  FORM_KEY,
  FORM_STILL_LOGIN,
  FORM_SUBMITTED,
  PASSKEY_REQUESTED,
  type FormFieldReport,
} from '../../shared/page-bridge';
import type { Notice } from '../../shared/types';
import type { CredentialPrompt } from '../../shared/vault';
import { pageHandleFor } from '../browser/electron-page-host';
import type { FormAssist, FormSurface, FormTarget } from './form-assist';

const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
});

const fieldReport = z.object({
  group: z.enum(['login', 'address', 'card']),
  kind: z.string().max(40),
  rect: rect.nullable(),
  username: z.string().max(4096),
});

const credentials = z.object({
  username: z.string().max(4096),
  password: z.string().min(1).max(4096),
});

/** How often one page may say a site's passkey request went unanswered. */
const PASSKEY_NOTICE_GAP_MS = 30_000;

export interface FormAssistBridgeOptions {
  /** Whether frames in this session are served; `canSave` for what they keep. */
  accepts(session: Session): { canSave: boolean } | null;
  /** Shows a page's offer in the window it's in; `null` withdraws it. */
  prompt(prompt: CredentialPrompt | null): void;
  /** For a popup, which has no shell of its own to say things in. */
  notify(notice: Notice): void;
  /** Where on the screen a menu should go, once `assist` decides to show one. */
  setAnchor(parent: BaseWindow, anchor: Rectangle): void;
  assist: FormAssist;
  key(key: 'up' | 'down' | 'enter'): void;
}

/** Where a frame's field is on the screen. */
function fieldOnScreen(
  contents: WebContents,
  report: Pick<FormFieldReport, 'rect'>,
): { parent: BaseWindow; anchor: Rectangle } | null {
  const place = pageHandleFor(contents)?.place();
  const popup = place ? null : BrowserWindow.fromWebContents(contents);
  const parent = place?.window ?? popup;
  if (!parent || parent.isDestroyed()) return null;
  const view = place?.bounds ?? { x: 0, y: 0 };
  const content = parent.getContentBounds();
  if (!report.rect) {
    // A frame from another site can't tell where it is; the click is the field.
    const cursor = screen.getCursorScreenPoint();
    return {
      parent,
      anchor: { x: cursor.x, y: cursor.y + 8, width: 0, height: 8 },
    };
  }
  const zoom = contents.getZoomFactor();
  return {
    parent,
    anchor: {
      x: content.x + view.x + report.rect.x * zoom,
      y: content.y + view.y + report.rect.y * zoom,
      width: report.rect.width * zoom,
      height: report.rect.height * zoom,
    },
  };
}

/** Connects frames' reports, which arrive from any session, to `FormAssist`. */
export function bridgeFormAssist(options: FormAssistBridgeOptions): void {
  const { assist } = options;
  const targets = new WeakMap<WebFrameMain, FormTarget>();
  const surfaces = new Map<number, FormSurface>();
  const passkeyNoticeAt = new Map<number, number>();

  const targetOf = (frame: WebFrameMain): FormTarget => {
    let target = targets.get(frame);
    if (!target) {
      target = {
        url: () => (frame.isDestroyed() ? '' : frame.url),
        alive: () => !frame.isDestroyed(),
        fill: (fill) => {
          if (!frame.isDestroyed()) frame.send(FORM_FILL, fill);
        },
        closed: () => {
          if (!frame.isDestroyed()) frame.send(FORM_CLOSED);
        },
      };
      targets.set(frame, target);
    }
    return target;
  };

  const surfaceOf = (contents: WebContents): FormSurface | null => {
    const accepted = options.accepts(contents.session);
    if (!accepted) return null;
    const known = surfaces.get(contents.id);
    if (known) return known;
    const surface: FormSurface = {
      key: contents.id,
      pageId: pageHandleFor(contents)?.pageId ?? null,
      canSave: accepted.canSave,
      prompt: options.prompt,
      notify: (notice) => {
        const handle = webContents.fromId(contents.id)
          ? pageHandleFor(contents)
          : undefined;
        if (handle) handle.notify(notice);
        else options.notify(notice);
      },
    };
    surfaces.set(contents.id, surface);
    contents.once('destroyed', () => {
      surfaces.delete(contents.id);
      passkeyNoticeAt.delete(contents.id);
      // A login still waiting for an answer goes with its page.
      assist.stillLogin(surface);
    });
    // The field the menu belongs to is gone.
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) assist.dismiss();
    });
    return surface;
  };

  ipcMain.handle(FORM_ASK, (event, raw: unknown) => {
    const frame = event.senderFrame;
    const parsed = fieldReport.safeParse(raw);
    const surface = surfaceOf(event.sender);
    if (!frame || !parsed.success || !surface) return false;
    const report = parsed.data as FormFieldReport;
    const place = fieldOnScreen(event.sender, report);
    if (!place) return false;
    options.setAnchor(place.parent, place.anchor);
    return assist.ask(targetOf(frame), surface, report);
  });
  ipcMain.on(FORM_DISMISS, (event) => {
    if (event.senderFrame) assist.dismiss(targetOf(event.senderFrame));
  });
  ipcMain.on(FORM_KEY, (event, key: unknown) => {
    if (key === 'up' || key === 'down' || key === 'enter') options.key(key);
  });
  ipcMain.on(FORM_SUBMITTED, (event, raw: unknown) => {
    const frame = event.senderFrame;
    const parsed = credentials.safeParse(raw);
    const surface = surfaceOf(event.sender);
    if (frame && parsed.success && surface) {
      assist.submitted(targetOf(frame), surface, parsed.data);
    }
  });
  ipcMain.on(FORM_STILL_LOGIN, (event) => {
    const surface = surfaceOf(event.sender);
    if (surface) assist.stillLogin(surface);
  });
  ipcMain.on(PASSKEY_REQUESTED, (event) => {
    const surface = surfaceOf(event.sender);
    if (!surface) return;
    const now = Date.now();
    const last = passkeyNoticeAt.get(event.sender.id) ?? 0;
    if (now - last < PASSKEY_NOTICE_GAP_MS) return;
    passkeyNoticeAt.set(event.sender.id, now);
    let host = 'This site';
    try {
      host = new URL(event.senderFrame?.url ?? '').host || host;
    } catch {
      /* A frame that's already gone. */
    }
    surface.notify({ kind: 'passkey-unavailable', host });
  });
}
