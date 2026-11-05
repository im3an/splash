import { useEffect } from 'react';
import {
  BOOKMARK_DRAG_TYPE,
  fileLink,
  moveBookmarks,
  parseDroppedLink,
  type BookmarkItems,
} from '../lib/bookmarks';
import { collectionNotice } from '../lib/collections';
import { hostOf } from '../lib/format';
import {
  dropTargetAt,
  sameTarget,
  useLinkDrag,
  type BookmarkDrop,
} from '../stores/drag-store';
import { useShell } from '../stores/shell-store';

const LINK_TYPES = ['text/uri-list', 'text/plain', BOOKMARK_DRAG_TYPE];

/**
 * A drag cancelled with esc, or one that moves on to a page's own view, doesn't
 * always say so here. While a drag is over this view, dragover keeps coming
 * even if the pointer rests, so a pause this long means it has gone.
 */
const DRAG_GONE_MS = 800;

function carriesLink(data: DataTransfer | null): data is DataTransfer {
  return !!data && LINK_TYPES.some((type) => data.types.includes(type));
}

function bookmarkDropAt(x: number, y: number): BookmarkDrop | null {
  const target = dropTargetAt(x, y);
  return target?.kind === 'favorites' || target?.kind === 'folder'
    ? target
    : null;
}

/** The icon of an open page on the same site, if there is one. */
function iconFor(url: string): string | null {
  const host = hostOf(url);
  const pages = Object.values(useShell.getState().snapshot?.pages ?? {});
  const icon = pages.find(
    (page) => page.faviconUrl && page.url && hostOf(page.url) === host,
  )?.faviconUrl;
  return icon && icon.length <= 8192 ? icon : null;
}

/**
 * Lets a link dragged from a page or another app be filed by dropping it on
 * anything marked as a bookmark drop. A drop anywhere else stays refused, and
 * the shell never navigates to it.
 *
 * Only a drag that began in the shell may move bookmarks: a page can put any
 * type it likes on a drag of its own, so the type alone proves nothing.
 */
export function useLinkDrop() {
  useEffect(() => {
    let fromShell = false;
    let gone: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      clearTimeout(gone);
      useLinkDrag.setState({ active: false, target: null });
    };
    const stillHere = () => {
      clearTimeout(gone);
      gone = setTimeout(clear, DRAG_GONE_MS);
    };
    const onStart = () => {
      fromShell = true;
    };
    const onEnd = () => {
      fromShell = false;
      clear();
    };
    const onEnter = (event: DragEvent) => {
      if (!carriesLink(event.dataTransfer)) return;
      stillHere();
      useLinkDrag.setState({ active: true });
    };
    const onOver = (event: DragEvent) => {
      const data = event.dataTransfer;
      if (!carriesLink(data)) return;
      stillHere();
      const target = bookmarkDropAt(event.clientX, event.clientY);
      useLinkDrag.setState((state) =>
        state.active && sameTarget(state.target, target)
          ? state
          : { active: true, target },
      );
      if (!target) return;
      event.preventDefault();
      const allowed = data.effectAllowed;
      data.dropEffect =
        fromShell && data.types.includes(BOOKMARK_DRAG_TYPE)
          ? 'move'
          : allowed === 'link' || allowed === 'linkMove'
            ? 'link'
            : 'copy';
    };
    // Null means the drag has left this view, for a page or out of the window.
    const onLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) clear();
    };
    const onDrop = (event: DragEvent) => {
      const data = event.dataTransfer;
      const target = bookmarkDropAt(event.clientX, event.clientY);
      clear();
      if (!carriesLink(data) || !target) return;
      event.preventDefault();
      const folderId = target.kind === 'folder' ? target.id : null;
      const moving = fromShell ? data.getData(BOOKMARK_DRAG_TYPE) : '';
      if (moving) {
        void moveBookmarks(JSON.parse(moving) as BookmarkItems, folderId);
        return;
      }
      const link = parseDroppedLink((type) => data.getData(type));
      if (!link) {
        collectionNotice('That isn’t a web address, so it wasn’t bookmarked.');
        return;
      }
      void fileLink(
        { id: crypto.randomUUID(), ...link, faviconUrl: iconFor(link.url) },
        folderId,
      );
    };

    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(gone);
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, []);
}
