import type { ClosedSummary, Notice } from '../../shared/types';
import { api } from '../splash-api';
import type { UndoStep } from './trail-undo';
import { useToast, type ToastInput } from '../stores/toast-store';

const UNDO_MS = 9000;
const CONFIRM_MS = 4000;
const MAX_NAME = 24;

/** Long names are shortened so the count and the shortcut always show. */
function shortName(name: string): string {
  const characters = [...name];
  return characters.length > MAX_NAME
    ? `${characters
        .slice(0, MAX_NAME - 1)
        .join('')
        .trimEnd()}…`
    : name;
}

export function undoMessage(closed: ClosedSummary): string {
  const name = `“${shortName(closed.label)}”`;
  const pages = `${closed.pageCount} page${closed.pageCount === 1 ? '' : 's'}`;
  if (closed.kind === 'workspace') {
    return closed.pageCount > 0
      ? `Deleted workspace ${name} and its ${pages}.`
      : `Deleted workspace ${name}.`;
  }
  if (closed.kind === 'group') {
    return closed.pageCount > 0
      ? `Deleted group ${name} and its ${pages}.`
      : `Deleted group ${name}.`;
  }
  return closed.pageCount > 1
    ? `Closed ${name} and ${closed.pageCount - 1} more.`
    : `Closed ${name}.`;
}

/** The offer to bring back what was just closed. */
export function closedToast(closed: ClosedSummary): ToastInput {
  // A redo closes them again as a new close, which the next undo must name.
  let { serial } = closed;
  return {
    message: undoMessage(closed),
    detail: '⇧⌘T also undoes it.',
    durationMs: UNDO_MS,
    closedSerial: closed.serial,
    actions: [
      {
        label: 'Undo',
        title: 'Reopen closed (⇧⌘T)',
        icon: 'undo',
        run: () => api().undoClose(serial),
        redo: async () => {
          const next = await api().closeAgain(serial);
          if (next === null) return false;
          serial = next;
          return true;
        },
      },
    ],
  };
}

export function noticeMessage(notice: Notice): string {
  switch (notice.kind) {
    case 'exported':
      return `Saved “${shortName(notice.filename)}”.`;
    case 'password-saved':
      return `Saved your password for ${notice.host}.`;
    case 'passkey-unavailable':
      return `${notice.host} asked for a passkey, and Splash can’t use Touch ID or iCloud passkeys yet.`;
    case 'no-video':
      return notice.blocked
        ? 'This site doesn’t allow picture in picture.'
        : 'There’s no video playing on this page.';
    case 'cannot-open-file':
      return `Splash can’t show “${shortName(notice.filename)}”.`;
    case 'helper-ended':
      return `${notice.extension} couldn’t reach its helper app.`;
    case 'moved': {
      const name = `“${shortName(notice.label)}”`;
      const what =
        notice.pageCount > 1
          ? `${name} and ${notice.pageCount - 1} more`
          : name;
      return `Moved ${what} to ${shortName(notice.workspaceName)}.`;
    }
    case 'pinned':
      return notice.pinned
        ? `Pinned “${shortName(notice.label)}” to the top of the trail.`
        : `Unpinned “${shortName(notice.label)}”.`;
    case 'kept-pinned':
      return notice.asleep
        ? `“${shortName(notice.label)}” is pinned, so it went to sleep instead.`
        : `“${shortName(notice.label)}” is pinned, so it stays.`;
    case 'page-saved':
      return `Saved “${notice.filename}”.`;
    case 'no-app':
      return `No app on this Mac opens “${notice.scheme}:” links.`;
    case 'nothing-to-paste':
      return 'There’s no text on the clipboard to open.';
    case 'shell-recovered':
      return 'Splash’s window had a problem and reloaded. Your pages are as you left them.';
    case 'copied':
      switch (notice.what) {
        case 'link':
          return notice.subject
            ? `Copied link to “${shortName(notice.subject)}”.`
            : 'Copied link.';
        case 'markdown':
          return notice.subject
            ? `Copied “${shortName(notice.subject)}” as Markdown.`
            : 'Copied as Markdown.';
        case 'text':
          return notice.subject
            ? `Copied “${shortName(notice.subject)}” as plain text.`
            : 'Copied as plain text.';
        case 'image':
          return 'Copied image.';
        case 'image-address':
          return 'Copied image address.';
      }
  }
}

/** A toast confirming something done in a native menu. */
export function noticeToast(notice: Notice): ToastInput {
  const message = noticeMessage(notice);
  switch (notice.kind) {
    case 'passkey-unavailable':
      return {
        message,
        detail:
          'Use a security key if you have one, or another way to sign in.',
        durationMs: UNDO_MS,
        actions: [],
      };
    case 'cannot-open-file':
      return {
        message,
        detail: 'It opens web pages, PDFs, images, text, audio and video.',
        durationMs: UNDO_MS,
        actions: [],
      };
    case 'helper-ended':
      return {
        message,
        detail:
          'Its desktop features, such as unlocking with the desktop app, may not work. The rest of it still does.',
        durationMs: UNDO_MS,
        actions: [],
      };
    case 'exported':
    case 'password-saved':
    case 'no-video':
    case 'page-saved':
    case 'copied':
    case 'no-app':
    case 'nothing-to-paste':
    case 'shell-recovered':
      return { message, detail: null, durationMs: CONFIRM_MS, actions: [] };
    case 'pinned': {
      const { pageId, pinned, origin, at } = notice;
      return {
        message,
        detail: pinned ? '⌘D unpins it.' : null,
        durationMs: UNDO_MS,
        actions: [
          {
            label: 'Undo',
            title: pinned ? 'Unpin it' : 'Pin it again',
            icon: 'undo',
            run: () => api().setPinned(pageId, !pinned, origin),
            redo: () => api().setPinned(pageId, pinned, at),
          },
        ],
      };
    }
    case 'kept-pinned': {
      const { pageId } = notice;
      return {
        message,
        detail: null,
        durationMs: UNDO_MS,
        actions: [
          {
            label: 'Unpin and close',
            title: 'Close it for good (⇧⌘T reopens it)',
            run: () => void api().closePage(pageId, { unpin: true }),
          },
        ],
      };
    }
    case 'moved':
      return movedToast(notice, message);
  }
}

function movedToast(
  notice: Extract<Notice, { kind: 'moved' }>,
  message: string,
): ToastInput {
  const { pageId, origin, workspaceId, index } = notice;
  return {
    message,
    detail: null,
    durationMs: UNDO_MS,
    actions: [
      {
        label: 'Go there',
        title: `Switch to ${notice.workspaceName}`,
        run: () => void api().activatePage(pageId),
      },
      {
        label: 'Undo',
        title: 'Move it back',
        icon: 'undo',
        run: () => api().returnPage(pageId, origin),
        // The same call, quiet, sends it forward again.
        redo: () =>
          api().returnPage(pageId, {
            workspaceId,
            parentId: null,
            index,
            wasActive: false,
          }),
      },
    ],
  };
}

/** Confirms a page dragged to a new place in the trail, with the way back. */
export function trailMoveToast({
  label,
  parentLabel,
  sameParent,
  undo,
  redo,
}: {
  label: string;
  /** Where it went; `null` for the top level. */
  parentLabel: string | null;
  /** Only its order among its siblings changed. */
  sameParent: boolean;
  undo: UndoStep;
  redo: UndoStep;
}): ToastInput {
  const name = `“${shortName(label)}”`;
  const message = sameParent
    ? `Moved ${name}.`
    : parentLabel
      ? `Moved ${name} under “${shortName(parentLabel)}”.`
      : `Moved ${name} to the top level.`;
  return {
    message,
    detail: null,
    durationMs: UNDO_MS,
    actions: [
      { label: 'Undo', title: 'Put it back', icon: 'undo', run: undo, redo },
    ],
  };
}

/** Confirms a rename; `name` is `null` when it went back to the page's title. */
export function renamedToast(
  name: string | null,
  undo: UndoStep,
  redo: UndoStep,
): ToastInput {
  return {
    message: name
      ? `Renamed to “${shortName(name)}”.`
      : 'Back to the page’s own title.',
    detail: null,
    durationMs: UNDO_MS,
    actions: [
      {
        label: 'Undo',
        title: 'Use the old name',
        icon: 'undo',
        run: undo,
        redo,
      },
    ],
  };
}
