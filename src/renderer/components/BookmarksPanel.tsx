import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import {
  BOOKMARK_DRAG_TYPE,
  bookmarkRows,
  createFolder,
  deleteBookmarks,
  describeItems,
  moveBookmarks,
  moveTargets,
  openFolder,
  renameFolder,
  setFolderCollapsed,
  type BookmarkItems,
  type BookmarkRow,
} from '../lib/bookmarks';
import {
  collectionNotice,
  renameSavedLink,
  updateLibrary,
} from '../lib/collections';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { useBookmarksView } from '../stores/bookmarks-view-store';
import { useDropTarget } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import type { MenuEntry } from './ContextMenu';
import { SiteIcon } from './Favicon';
import { hostOf, openLink } from './IconStack';
import { PanelHeader } from './PanelHeader';
import { PanelState } from './PanelState';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14 } as const;

const rowName = (row: BookmarkRow) =>
  row.kind === 'folder'
    ? row.folder.name
    : row.link.title || hostOf(row.link.url);

function itemsOf(rows: BookmarkRow[]): BookmarkItems {
  return {
    linkIds: rows.filter((row) => row.kind === 'link').map((row) => row.id),
    folderIds: rows.filter((row) => row.kind === 'folder').map((row) => row.id),
  };
}

function copyLink(url: string) {
  void navigator.clipboard
    .writeText(url)
    .then(() => collectionNotice('Link copied.'))
    .catch(() => collectionNotice('Could not copy the link.'));
}

/**
 * Every bookmark and folder: search them, rename them, drag or send them to a
 * folder, delete many at once. A click opens a link and stays here, so several
 * can be opened in turn. ⌘-click, Shift-click and the check boxes select.
 */
export function BookmarksPanel() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const query = useBookmarksView((state) => state.query);
  const activeId = useBookmarksView((state) => state.activeId);
  const setQuery = (value: string) => {
    useBookmarksView.setState({ query: value, activeId: null });
    setSelected(new Set());
  };
  const setActive = (id: string | null) =>
    useBookmarksView.setState({ activeId: id });

  const rows = useMemo(
    () => bookmarkRows(collections, query),
    [collections, query],
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menu = useSidebarMenu('Bookmark');
  const dropTarget = useDropTarget();

  // Only what's on screen counts: a folded folder hides what it holds, and
  // nothing should be deleted that can't be seen.
  const chosen = rows.filter((row) => selected.has(row.id));
  const selecting = chosen.length > 0;

  useEffect(() => {
    if (!activeId) return;
    document
      .getElementById(`bookmark-${activeId}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const select = (row: BookmarkRow, range: boolean) => {
    const from = rows.findIndex((value) => value.id === anchor.current);
    const to = rows.indexOf(row);
    setSelected((previous) => {
      const next = new Set(previous);
      if (range && from !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const value of rows.slice(start, end + 1)) next.add(value.id);
      } else if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    if (!range) anchor.current = row.id;
  };

  const activate = (row: BookmarkRow, fresh = false) => {
    if (row.kind === 'link') return void openLink(row.link, fresh);
    if (query) {
      // Found by search: show it where it lives.
      useBookmarksView.setState({ query: '', activeId: row.id });
      setSelected(new Set());
      return void setFolderCollapsed(row.id, false);
    }
    void setFolderCollapsed(row.id, !row.folder.collapsed);
  };

  const onRowClick = (row: BookmarkRow, event: MouseEvent) => {
    setActive(row.id);
    if (event.shiftKey || event.metaKey || selecting) {
      select(row, event.shiftKey);
      return;
    }
    anchor.current = row.id;
    activate(row);
  };

  const newFolder = async (parentId: string | null = null) => {
    const id = crypto.randomUUID();
    const saved = await updateLibrary((items) =>
      createFolder(items, id, 'New Folder', parentId).map((item) =>
        item.id === parentId ? { ...item, collapsed: false } : item,
      ),
    );
    if (!saved) return;
    useBookmarksView.setState({ query: '', activeId: id });
    setRenaming(id);
  };

  const moveMenu = (items: BookmarkItems): MenuEntry[] =>
    moveTargets(collections, items.folderIds).map((target) => ({
      kind: 'action',
      label: target.name,
      icon: target.id ? <Folder {...ICON} /> : <Star {...ICON} />,
      run: () => {
        setSelected(new Set());
        void moveBookmarks(items, target.id);
      },
    }));

  const remove = (items: BookmarkItems) => {
    setSelected(new Set());
    void deleteBookmarks(items);
  };

  const entriesFor = (row: BookmarkRow): MenuEntry[] => {
    // On a row of a selection, it acts on the whole selection.
    if (selected.has(row.id) && chosen.length > 1) {
      const items = itemsOf(chosen);
      return [
        {
          kind: 'submenu',
          label: `Move ${chosen.length} Items to`,
          icon: <FolderInput {...ICON} />,
          entries: moveMenu(items),
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: `Delete ${chosen.length} Items`,
          icon: <Trash2 {...ICON} />,
          run: () => remove(items),
        },
      ];
    }
    const items = itemsOf([row]);
    const shared: MenuEntry[] = [
      {
        kind: 'action',
        label: 'Rename…',
        icon: <Pencil {...ICON} />,
        shortcut: 'F2',
        run: () => setRenaming(row.id),
      },
      {
        kind: 'submenu',
        label: 'Move to',
        icon: <FolderInput {...ICON} />,
        entries: moveMenu(items),
      },
    ];
    if (row.kind === 'folder') {
      const count = row.folder.links.length;
      return [
        {
          kind: 'action',
          label: count ? `Open All (${count})` : 'Open All',
          icon: <ExternalLink {...ICON} />,
          disabled: count === 0,
          run: () => void openFolder(row.folder),
        },
        {
          kind: 'action',
          label: 'New Folder Inside',
          icon: <FolderPlus {...ICON} />,
          run: () => void newFolder(row.id),
        },
        { kind: 'separator' },
        ...shared,
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'Delete Folder',
          icon: <Trash2 {...ICON} />,
          shortcut: '⌫',
          run: () => remove(items),
        },
      ];
    }
    return [
      {
        kind: 'action',
        label: 'Open',
        icon: <ExternalLink {...ICON} />,
        shortcut: '↩',
        run: () => void openLink(row.link, false),
      },
      {
        kind: 'action',
        label: 'Open in New Page',
        icon: <Plus {...ICON} />,
        shortcut: '⌘↩',
        run: () => void openLink(row.link, true),
      },
      { kind: 'separator' },
      ...shared,
      {
        kind: 'action',
        label: 'Copy Link',
        icon: <Copy {...ICON} />,
        run: () => copyLink(row.link.url),
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Delete',
        icon: <Trash2 {...ICON} />,
        shortcut: '⌫',
        run: () => remove(items),
      },
    ];
  };

  const commitRename = (row: BookmarkRow, value: string) => {
    setRenaming(null);
    listRef.current?.focus();
    if (row.kind === 'folder') {
      if (value.trim() && value.trim() !== row.folder.name)
        void renameFolder(row.id, value);
    } else if (value.trim() !== row.link.title) {
      void renameSavedLink(row.id, value.trim());
    }
  };

  const onListKey = (event: KeyboardEvent) => {
    const index = rows.findIndex((row) => row.id === activeId);
    const row = rows[index];
    const moveTo = (next: number) => {
      const target = rows[next];
      if (!target) return;
      setActive(target.id);
      if (event.shiftKey) select(target, true);
      else anchor.current = target.id;
    };
    switch (event.key) {
      case 'ArrowDown':
        moveTo(Math.min(index + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        if (index <= 0) {
          setActive(null);
          searchRef.current?.focus();
        } else moveTo(index - 1);
        break;
      case 'ArrowRight':
        if (row?.kind === 'folder' && row.folder.collapsed && !query)
          void setFolderCollapsed(row.id, false);
        break;
      case 'ArrowLeft':
        if (row?.kind === 'folder' && !row.folder.collapsed && !query)
          void setFolderCollapsed(row.id, true);
        break;
      case 'Enter':
        if (row) activate(row, event.metaKey);
        break;
      case ' ':
        if (row) select(row, event.shiftKey);
        break;
      case 'F2':
        if (row) setRenaming(row.id);
        break;
      case 'Backspace':
      case 'Delete':
        if (selecting) remove(itemsOf(chosen));
        else if (row) remove(itemsOf([row]));
        break;
      case 'a':
        if (!event.metaKey) return;
        setSelected(new Set(rows.map((value) => value.id)));
        break;
      case 'Escape':
        if (!selecting) return;
        setSelected(new Set());
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onSearchKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' && rows.length) {
      event.preventDefault();
      setActive(rows[0]!.id);
      anchor.current = rows[0]!.id;
      listRef.current?.focus();
    } else if (event.key === 'Enter' && rows[0]) {
      event.preventDefault();
      activate(rows[0]);
    } else if (event.key === 'Escape' && (query || selecting)) {
      // The first press clears; the next goes back to the trail.
      event.preventDefault();
      setQuery('');
    }
  };

  const onDragStart = (row: BookmarkRow, event: DragEvent) => {
    const items = itemsOf(selected.has(row.id) ? chosen : [row]);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, JSON.stringify(items));
    if (row.kind === 'link') {
      event.dataTransfer.setData('text/uri-list', row.link.url);
      event.dataTransfer.setData('text/plain', row.link.url);
    }
  };

  const overRoot = dropTarget?.kind === 'favorites';

  return (
    <>
      <PanelHeader title="Bookmarks">
        <button
          type="button"
          className="icon-button shrink-0"
          aria-label="New folder"
          title="New folder"
          onClick={() => void newFolder()}
        >
          <FolderPlus size={15} />
        </button>
      </PanelHeader>
      <div className="mt-1.5 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-control bg-field pr-1 pl-2.5 transition-[background-color,box-shadow] duration-base ease-out focus-within:bg-field-focus focus-within:shadow-focus">
        <Search
          size={14}
          aria-hidden
          className="grid size-4 shrink-0 text-fg-subtle"
        />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          maxLength={1000}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search bookmarks"
          aria-label="Search bookmarks"
          aria-controls="bookmark-results"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
        />
        {query && (
          <button
            type="button"
            className="icon-button size-6 shrink-0"
            aria-label="Clear bookmark search"
            title="Clear search (esc)"
            onClick={() => setQuery('')}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div data-drop="favorites" className="flex min-h-0 flex-1 flex-col">
          {query ? (
            <PanelState
              icon={Search}
              title="No matching bookmarks"
              detail={`Nothing matches “${query.trim()}”. Try a different word or part of an address.`}
              action="Clear search"
              onAction={() => setQuery('')}
            />
          ) : (
            <PanelState
              icon={Star}
              title="Keep the pages you return to"
              detail="Press the star on any page, or drag a link here."
            />
          )}
        </div>
      ) : (
        <div
          ref={listRef}
          id="bookmark-results"
          role="listbox"
          aria-label="Bookmarks"
          aria-multiselectable
          aria-activedescendant={activeId ? `bookmark-${activeId}` : undefined}
          tabIndex={0}
          data-drop="favorites"
          data-over={overRoot}
          data-selecting={selecting}
          onKeyDown={onListKey}
          className="bookmark-list"
        >
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              active={row.id === activeId}
              chosen={selected.has(row.id)}
              over={dropTarget?.kind === 'folder' && dropTarget.id === row.id}
              renaming={renaming === row.id}
              menuOpen={menu.openOn?.dataset.bookmark === row.id}
              onClick={(event) => onRowClick(row, event)}
              onCheck={(event) => {
                event.stopPropagation();
                setActive(row.id);
                select(row, event.shiftKey);
              }}
              onMenu={(event) => {
                setActive(row.id);
                menu.show(event, entriesFor(row));
              }}
              onMore={(event) => {
                setActive(row.id);
                menu.show(event, entriesFor(row), true);
              }}
              onDragStart={(event) => onDragStart(row, event)}
              onRename={(value) => commitRename(row, value)}
              onCancelRename={() => {
                setRenaming(null);
                listRef.current?.focus();
              }}
            />
          ))}
        </div>
      )}
      {selecting && (
        <div
          role="toolbar"
          aria-label="Selected bookmarks"
          className="toast-in mt-1 mb-2 flex shrink-0 items-center gap-1 rounded-row bg-row-hover py-1 pr-1 pl-3 text-small text-fg-muted"
        >
          <span className="min-w-0 flex-1 truncate">
            {describeItems(itemsOf(chosen))} selected
          </span>
          <button
            type="button"
            className="button px-2 text-small"
            aria-haspopup="menu"
            onClick={(event) =>
              menu.show(event, moveMenu(itemsOf(chosen)), true)
            }
          >
            Move to…
          </button>
          <button
            type="button"
            className="button px-2 text-small"
            onClick={() => remove(itemsOf(chosen))}
          >
            Delete
          </button>
          <button
            type="button"
            className="icon-button size-6 shrink-0"
            aria-label="Clear selection"
            title="Clear selection (esc)"
            onClick={() => setSelected(new Set())}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {menu.element}
    </>
  );
}

function Row({
  row,
  active,
  chosen,
  over,
  renaming,
  menuOpen,
  onClick,
  onCheck,
  onMenu,
  onMore,
  onDragStart,
  onRename,
  onCancelRename,
}: {
  row: BookmarkRow;
  active: boolean;
  chosen: boolean;
  over: boolean;
  renaming: boolean;
  menuOpen: boolean;
  onClick(event: MouseEvent): void;
  onCheck(event: MouseEvent): void;
  onMenu(event: MouseEvent<HTMLElement>): void;
  onMore(event: MouseEvent<HTMLElement>): void;
  onDragStart(event: DragEvent): void;
  onRename(value: string): void;
  onCancelRename(): void;
}) {
  const name = rowName(row);
  const folded = row.kind === 'folder' && row.folder.collapsed;
  return (
    <div
      id={`bookmark-${row.id}`}
      role="option"
      aria-selected={chosen}
      aria-expanded={row.kind === 'folder' ? !folded : undefined}
      title={row.kind === 'link' ? `${name}\n${row.link.url}` : undefined}
      draggable={!renaming}
      data-bookmark={row.id}
      data-active={active}
      data-chosen={chosen}
      data-over={over}
      data-menu-open={menuOpen}
      data-drop={row.kind === 'folder' ? `folder:${row.id}` : undefined}
      style={{ '--depth': row.depth } as CSSProperties}
      onClick={renaming ? undefined : onClick}
      onContextMenu={onMenu}
      onDragStart={onDragStart}
      className="sidebar-row bookmark-row"
    >
      <button
        type="button"
        role="checkbox"
        tabIndex={-1}
        aria-checked={chosen}
        aria-label={`Select ${name}`}
        title="Select"
        onClick={onCheck}
        className="bookmark-check"
      >
        <span className="bookmark-check-box">
          {chosen && <Check size={10} strokeWidth={3} aria-hidden />}
        </span>
      </button>
      <span className="bookmark-indent" aria-hidden />
      {row.kind === 'folder' ? (
        <>
          <ChevronRight
            size={12}
            aria-hidden
            data-open={!folded}
            className="bookmark-chevron"
          />
          <Folder size={14} aria-hidden className="shrink-0 text-fg-subtle" />
        </>
      ) : (
        <span className="stack-link-icon">
          <SiteIcon url={row.link.faviconUrl} site={row.link.url} />
        </span>
      )}
      {renaming ? (
        <RenameField
          value={row.kind === 'folder' ? row.folder.name : row.link.title}
          label={row.kind === 'folder' ? 'Folder name' : 'Bookmark name'}
          onDone={onRename}
          onCancel={onCancelRename}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{name}</span>
      )}
      {!renaming &&
        (row.kind === 'folder' ? (
          <span className="sidebar-row-count">{row.count}</span>
        ) : (
          <span className="bookmark-host">
            {row.folderName ?? displayHost(row.link.url)}
          </span>
        ))}
      {!renaming && (
        <button
          type="button"
          tabIndex={-1}
          className="sidebar-row-more"
          aria-label={`More actions for ${name}`}
          title="More"
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            onMore(event);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
  );
}

function displayHost(url: string) {
  return hostOf(url).replace(/^www\./, '');
}

function RenameField({
  value,
  label,
  onDone,
  onCancel,
}: {
  value: string;
  label: string;
  onDone(value: string): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (run: () => void) => {
    if (finished.current) return;
    finished.current = true;
    run();
  };
  return (
    <input
      ref={ref}
      defaultValue={value}
      aria-label={label}
      maxLength={label === 'Folder name' ? 100 : 300}
      spellCheck={false}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const typed = event.currentTarget.value;
        finish(() => onDone(typed));
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          const typed = event.currentTarget.value;
          finish(() => onDone(typed));
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(onCancel);
        }
      }}
      className="editing-field h-6 min-w-0 flex-1 rounded-inner px-1.5 text-fg select-text"
    />
  );
}
