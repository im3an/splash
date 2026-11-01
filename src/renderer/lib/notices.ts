import type { ClosedSummary, Notice } from '../../shared/types';
import { api } from '../splash-api';
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
  return closed.pageCount > 1
    ? `Closed ${name} and ${closed.pageCount - 1} more.`
    : `Closed ${name}.`;
}

/** The offer to bring back what was just closed. */
export function closedToast(closed: ClosedSummary): ToastInput {
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
        run: () => void api().reopenClosed(),
      },
    ],
  };
}

export function noticeMessage(notice: Notice): string {
  switch (notice.kind) {
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
    case 'copied':
      switch (notice.what) {
        case 'link':
          return notice.subject
            ? `Copied link to “${shortName(notice.subject)}”.`
            : 'Copied link.';
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
    case 'page-saved':
    case 'copied':
      return { message, detail: null, durationMs: CONFIRM_MS, actions: [] };
    case 'pinned': {
      const { pageId, pinned, origin } = notice;
      return {
        message,
        detail: pinned ? '⌘D unpins it.' : null,
        durationMs: UNDO_MS,
        actions: [
          {
            label: 'Undo',
            title: pinned ? 'Unpin it' : 'Pin it again',
            icon: 'undo',
            run: () => void api().setPinned(pageId, !pinned, origin),
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
  const { pageId, origin, label } = notice;
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
        run: () =>
          void api()
            .returnPage(pageId, origin)
            .catch(() =>
              useToast.getState().show({
                message: `Couldn’t move “${shortName(label)}” back. It may have been closed.`,
                detail: null,
                durationMs: CONFIRM_MS,
                actions: [],
              }),
            ),
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
}: {
  label: string;
  /** Where it went; `null` for the top level. */
  parentLabel: string | null;
  /** Only its order among its siblings changed. */
  sameParent: boolean;
  undo(): void;
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
    actions: [{ label: 'Undo', title: 'Put it back', icon: 'undo', run: undo }],
  };
}

/** Confirms a rename; `name` is `null` when it went back to the page's title. */
export function renamedToast(
  name: string | null,
  undo: () => void,
): ToastInput {
  return {
    message: name
      ? `Renamed to “${shortName(name)}”.`
      : 'Back to the page’s own title.',
    detail: null,
    durationMs: UNDO_MS,
    actions: [
      { label: 'Undo', title: 'Use the old name', icon: 'undo', run: undo },
    ],
  };
}
