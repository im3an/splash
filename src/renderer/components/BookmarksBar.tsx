import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import {
  ChevronDown,
  ChevronsRight,
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import {
  openFolder,
  setBookmarksBar,
  subfolders,
  type SavedLink,
} from '../lib/bookmarks';
import {
  collectionNotice,
  mainFolder,
  removeFavorite,
} from '../lib/collections';
import { showBookmarks } from '../stores/bookmarks-view-store';
import { useDropTarget } from '../stores/drag-store';
import { useOverlay } from '../stores/overlay-store';
import { selectBlank, useShell } from '../stores/shell-store';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { SiteIcon } from './Favicon';
import { hostOf, openLink } from './IconStack';
import { Reveal } from './Reveal';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14 } as const;
/** Room kept at the end for the button holding what doesn't fit. */
const MORE_WIDTH = 30;

type BarItem =
  | { kind: 'folder'; id: string; folder: SavedCollection }
  | { kind: 'link'; id: string; link: SavedLink };

interface OpenMenu {
  label: string;
  entries: MenuEntry[];
  x: number;
  y: number;
  element: HTMLElement;
  keyboard: boolean;
  serial: number;
}

/** A row of a folder's menu: open the link there and then. */
function linkEntry(link: SavedLink): MenuEntry {
  return {
    kind: 'action',
    label: link.title || hostOf(link.url),
    icon: <SiteIcon url={link.faviconUrl} site={link.url} />,
    run: () => void openLink(link, false),
  };
}

/** A folder as a menu: its folders unfold in place, then its links. */
function folderMenu(
  items: SavedCollection[],
  folder: SavedCollection,
): MenuEntry[] {
  const inside = subfolders(items, folder.id);
  if (!inside.length && !folder.links.length)
    return [
      {
        kind: 'action',
        label: 'Nothing here yet',
        icon: null,
        disabled: true,
        run: () => undefined,
      },
    ];
  return [
    ...inside.map(
      (child): MenuEntry => ({
        kind: 'submenu',
        label: child.name,
        icon: <Folder {...ICON} />,
        entries: folderMenu(items, child),
      }),
    ),
    ...folder.links.map(linkEntry),
    ...(folder.links.length > 1
      ? ([
          { kind: 'separator' },
          {
            kind: 'action',
            label: `Open All (${folder.links.length})`,
            icon: <ExternalLink {...ICON} />,
            run: () => void openFolder(folder),
          },
        ] satisfies MenuEntry[])
      : []),
  ];
}

const barEntries: MenuEntry[] = [
  {
    kind: 'action',
    label: 'Hide Bookmarks Bar',
    icon: <EyeOff {...ICON} />,
    shortcut: '⇧⌘B',
    run: () => setBookmarksBar(false),
  },
];

/**
 * An optional row of bookmarks over the page: folders, then the links at the
 * top level. What doesn't fit moves to a button at the end. The sidebar holds
 * the same things, so it's off until asked for.
 */
export function BookmarksBar() {
  const shown = useShell((state) => state.preferences?.bookmarksBar ?? false);
  const blank = useShell(selectBlank);
  return (
    <Reveal show={shown && !blank}>
      <Bar />
    </Reveal>
  );
}

function Bar() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const activeUrl = useShell((state) => {
    const id = state.snapshot?.activePageId;
    return id ? (state.snapshot?.pages[id]?.url ?? null) : null;
  });
  const target = useDropTarget();
  const items = useMemo<BarItem[]>(
    () => [
      ...subfolders(collections, null).map(
        (folder): BarItem => ({ kind: 'folder', id: folder.id, folder }),
      ),
      ...(mainFolder(collections)?.links ?? []).map(
        (link): BarItem => ({ kind: 'link', id: link.id, link }),
      ),
    ],
    [collections],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);

  // Every item stays laid out, so each can be measured; those past the room
  // are hidden and listed under the button instead.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const kids = [...list.children] as HTMLElement[];
      const end = (kid: HTMLElement) => kid.offsetLeft + kid.offsetWidth;
      const last = kids.at(-1);
      const room = list.clientWidth;
      if (!last || end(last) <= room) return setFit(kids.length);
      setFit(kids.filter((kid) => end(kid) <= room - MORE_WIDTH).length);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [items]);

  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [menuReady, setMenuReady] = useState(false);
  const serial = useRef(0);

  // A live page would paint over a menu reaching it, so it steps aside first.
  useEffect(() => {
    setMenuReady(false);
    if (!menu) return;
    let cancelled = false;
    void useOverlay
      .getState()
      .open({ kind: 'bookmarks-menu' })
      .then(() => {
        if (!cancelled) setMenuReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMenu(null);
          collectionNotice('Could not open that menu. Try again.');
        }
      });
    return () => {
      cancelled = true;
      if (useOverlay.getState().overlay?.kind === 'bookmarks-menu')
        useOverlay.getState().close();
    };
  }, [menu]);

  const openMenu = (
    event: MouseEvent<HTMLElement>,
    label: string,
    entries: MenuEntry[],
    anchored: boolean,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const keyboard =
      event.detail === 0 || (event.clientX === 0 && event.clientY === 0);
    setMenu({
      label,
      entries,
      x: anchored || keyboard ? rect.left : event.clientX,
      y: anchored || keyboard ? rect.bottom + 4 : event.clientY,
      element: event.currentTarget,
      keyboard,
      serial: ++serial.current,
    });
  };

  const linkMenu = (link: SavedLink): MenuEntry[] => [
    {
      kind: 'action',
      label: 'Open',
      icon: <ExternalLink {...ICON} />,
      run: () => void openLink(link, false),
    },
    {
      kind: 'action',
      label: 'Open in New Page',
      icon: <Plus {...ICON} />,
      run: () => void openLink(link, true),
    },
    {
      kind: 'action',
      label: 'Copy Link',
      icon: <Copy {...ICON} />,
      run: () => {
        void navigator.clipboard
          .writeText(link.url)
          .then(() => collectionNotice('Link copied.'))
          .catch(() => collectionNotice('Could not copy the link.'));
      },
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Remove from Bookmarks',
      icon: <Trash2 {...ICON} />,
      run: () => void removeFavorite(link.url, link.title || hostOf(link.url)),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Manage Bookmarks…',
      icon: <Settings2 {...ICON} />,
      shortcut: '⌥⌘B',
      run: () => showBookmarks(),
    },
    ...barEntries,
  ];

  const folderActions = (folder: SavedCollection): MenuEntry[] => [
    {
      kind: 'action',
      label: folder.links.length
        ? `Open All (${folder.links.length})`
        : 'Open All',
      icon: <ExternalLink {...ICON} />,
      disabled: folder.links.length === 0,
      run: () => void openFolder(folder),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Manage Bookmarks…',
      icon: <Settings2 {...ICON} />,
      shortcut: '⌥⌘B',
      run: () => showBookmarks(folder.id),
    },
    ...barEntries,
  ];

  const hidden = items.slice(fit);

  return (
    <nav
      aria-label="Bookmarks bar"
      data-drop="favorites"
      data-over={target?.kind === 'favorites'}
      className="bookmarks-bar"
      onContextMenu={(event) => {
        // React bubbles a right click in the open menu up through its portal.
        if (!event.currentTarget.contains(event.target as Node)) return;
        openMenu(
          event,
          'Bookmarks bar',
          [
            {
              kind: 'action',
              label: 'Manage Bookmarks…',
              icon: <Settings2 {...ICON} />,
              shortcut: '⌥⌘B',
              run: () => showBookmarks(),
            },
            ...barEntries,
          ],
          false,
        );
      }}
    >
      <div ref={listRef} className="bookmarks-bar-list">
        {items.map((item, index) =>
          item.kind === 'folder' ? (
            <button
              key={item.id}
              type="button"
              className="bar-item"
              aria-haspopup="menu"
              data-drop={`folder:${item.id}`}
              data-over={target?.kind === 'folder' && target.id === item.id}
              style={barVisibility(index, fit)}
              onClick={(event) =>
                openMenu(
                  event,
                  item.folder.name,
                  folderMenu(collections, item.folder),
                  true,
                )
              }
              onContextMenu={(event) =>
                openMenu(
                  event,
                  item.folder.name,
                  folderActions(item.folder),
                  false,
                )
              }
            >
              <Folder size={13} aria-hidden className="shrink-0" />
              <span className="min-w-0 truncate">{item.folder.name}</span>
              <ChevronDown size={11} aria-hidden className="shrink-0" />
            </button>
          ) : (
            <button
              key={item.id}
              type="button"
              className="bar-item"
              title={`${item.link.title || hostOf(item.link.url)}\n${item.link.url}`}
              data-current={item.link.url === activeUrl}
              aria-current={item.link.url === activeUrl ? 'page' : undefined}
              style={barVisibility(index, fit)}
              onClick={(event) => void openLink(item.link, event.metaKey)}
              onAuxClick={(event) => {
                if (event.button === 1) void openLink(item.link, true);
              }}
              onContextMenu={(event) =>
                openMenu(
                  event,
                  item.link.title || hostOf(item.link.url),
                  linkMenu(item.link),
                  false,
                )
              }
            >
              <span className="stack-link-icon bar-item-icon">
                <SiteIcon url={item.link.faviconUrl} site={item.link.url} />
              </span>
              <span className="min-w-0 truncate">
                {item.link.title || hostOf(item.link.url)}
              </span>
            </button>
          ),
        )}
        {items.length === 0 && (
          <span className="bookmarks-bar-hint">
            Drag a link here, or press the star on any page.
          </span>
        )}
      </div>
      {hidden.length > 0 && (
        <button
          type="button"
          className="icon-button bookmarks-bar-more"
          aria-label={`${hidden.length} more ${hidden.length === 1 ? 'bookmark' : 'bookmarks'}`}
          title="More bookmarks"
          aria-haspopup="menu"
          onClick={(event) =>
            openMenu(
              event,
              'More bookmarks',
              hidden.map(
                (item): MenuEntry =>
                  item.kind === 'folder'
                    ? {
                        kind: 'submenu',
                        label: item.folder.name,
                        icon: <Folder {...ICON} />,
                        entries: folderMenu(collections, item.folder),
                      }
                    : linkEntry(item.link),
              ),
              true,
            )
          }
        >
          <ChevronsRight size={14} />
        </button>
      )}
      {menu && menuReady && (
        <ContextMenu
          key={menu.serial}
          label={menu.label}
          entries={menu.entries}
          x={menu.x}
          y={menu.y}
          bounds={{ left: 0, right: window.innerWidth }}
          fromKeyboard={menu.keyboard}
          returnFocus={menu.element}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}

function barVisibility(index: number, fit: number): CSSProperties | undefined {
  return index >= fit ? { visibility: 'hidden' } : undefined;
}
