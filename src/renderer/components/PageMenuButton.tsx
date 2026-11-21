import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Columns2,
  Download,
  FolderPlus,
  MoreHorizontal,
  Puzzle,
  Settings,
  Share,
  Sparkles,
  Star,
} from '../icons';
import { notesForSite, siteKey } from '../../shared/notes';
import { useIsPrivate } from '../hooks/use-is-private';
import { collectionNotice, toggleBookmark } from '../lib/collections';
import { pageParts } from '../lib/format';
import { api } from '../splash-api';
import { useAiPanel } from '../stores/ai-store';
import { openNotes, useNotes } from '../stores/notes-store';
import { useOverlay } from '../stores/overlay-store';
import {
  selectActivePage,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { ContextMenu, tidyEntries, type MenuEntry } from './ContextMenu';
import { EXTENSIONS_BUTTON_ID } from './ExtensionsPopover';
import { NotesMark } from './notes/NotesMark';
import { useGroupRename } from './SavedGroups';
import { useNotesSync } from './notes/NotesButton';

/**
 * The page's actions behind one button at the end of the sidebar's address
 * pill, where a row of icons wouldn't fit. Extensions' own buttons stay in
 * the pill beside it, so a blocker's count is still in view. It also stands
 * in for the extensions button, so their popover lines up with it.
 */
export function PageMenuButton() {
  const page = useShell(selectActivePage);
  const splitOpen = useShell((state) => selectVisibleSplit(state) !== null);
  const saved = useShell((state) =>
    state.preferences?.collections?.some(
      (item) =>
        item.kind === 'folder' &&
        item.links.some((link) => link.url === page?.url),
    ),
  );
  const aiOpen = useAiPanel((state) => state.open);
  const isPrivate = useIsPrivate();
  const notes = useNotes((state) => state.notes);
  useNotesSync();
  const key = siteKey(page?.url);
  const noteCount = useMemo(
    () => notesForSite(notes, key).length,
    [notes, key],
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    top: number;
    keyboard: boolean;
    serial: number;
  } | null>(null);
  const serial = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const [menuReady, setMenuReady] = useState(false);
  useEffect(() => {
    setMenuReady(false);
    if (!menu) return;
    let cancelled = false;
    void useOverlay
      .getState()
      .open({ kind: 'toolbar-menu' })
      .then(() => {
        if (!cancelled) setMenuReady(true);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
      if (useOverlay.getState().overlay?.kind === 'toolbar-menu')
        useOverlay.getState().close();
    };
  }, [menu]);

  const web = Boolean(page?.url && /^https?:\/\//i.test(page.url));
  const failed = () =>
    collectionNotice('Could not complete this action. Try again.');
  const entries: MenuEntry[] = tidyEntries([
    {
      kind: 'action',
      label: saved ? 'Remove from Bookmarks' : 'Add to Bookmarks',
      icon: (
        <Star
          size={14}
          fill={saved ? 'currentColor' : 'none'}
          className={saved ? 'text-accent' : ''}
        />
      ),
      shortcut: '⌘D',
      disabled: !web,
      run: () => page && void toggleBookmark(page).catch(failed),
    },
    {
      kind: 'action',
      label: 'Share Page…',
      icon: <Share size={14} />,
      disabled: !web,
      run: () => page && void api().sharePage(page.id).catch(failed),
    },
    {
      kind: 'action',
      label: splitOpen
        ? 'Close Split View'
        : page?.parentId
          ? 'Compare with Parent'
          : 'Compare with Child',
      icon: <Columns2 size={14} />,
      shortcut: '⌘\\',
      disabled:
        !page || (!splitOpen && !page.parentId && !page.childIds.length),
      run: () => page && void api().toggleSplit(page.id),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: noteCount
        ? `Notes for ${key} (${noteCount})`
        : key
          ? `New Note for ${key}`
          : 'Notes',
      icon: <NotesMark size={14} className={noteCount ? 'text-accent' : ''} />,
      shortcut: '⌥⌘N',
      run: () =>
        void openNotes(
          page?.url && key
            ? { key, url: page.url, title: pageParts(page).title || key }
            : null,
        ),
    },
    {
      kind: 'action',
      label: aiOpen ? 'Close AI Panel' : 'Ask AI',
      icon: <Sparkles size={14} />,
      shortcut: '⇧⌘A',
      run: () => useAiPanel.getState().toggle(),
    },
    {
      kind: 'action',
      label: 'Downloads',
      icon: <Download size={14} />,
      run: () =>
        void useOverlay
          .getState()
          .open({ kind: 'downloads' })
          .catch(() => useShell.getState().toggleSidebarPanel('downloads')),
    },
    ...(isPrivate
      ? []
      : [
          {
            kind: 'action' as const,
            label: 'Extensions…',
            icon: <Puzzle size={14} />,
            run: () =>
              void useOverlay
                .getState()
                .open({ kind: 'extensions' })
                .catch(() => undefined),
          },
        ]),
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'New Group',
      icon: <FolderPlus size={14} />,
      run: () =>
        void api()
          .createGroup()
          .then((id) => useGroupRename.setState({ id })),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Address Bar Settings…',
      icon: <Settings size={14} />,
      run: () => void api().openSettings(),
    },
  ]);

  return (
    <>
      <button
        ref={button}
        id={EXTENSIONS_BUTTON_ID}
        type="button"
        className="icon-button icon-button-sm relative shrink-0 aria-expanded:bg-row-hover aria-expanded:text-fg"
        aria-label="Page actions"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        title="Page actions"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          if (menu) return setMenu(null);
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({
            x: rect.right,
            y: rect.bottom,
            top: rect.top,
            keyboard: event.detail === 0,
            serial: ++serial.current,
          });
        }}
      >
        <MoreHorizontal size={14} />
        {/* A site with notes says so here, as the notes button did. */}
        {noteCount > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent"
          />
        )}
      </button>
      {menu && menuReady && (
        <ContextMenu
          key={menu.serial}
          label="Page actions"
          entries={entries}
          x={menu.x}
          y={menu.y}
          bounds={{ left: 0, right: window.innerWidth }}
          align="end"
          anchorTop={menu.top}
          fromKeyboard={menu.keyboard}
          returnFocus={button.current}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
