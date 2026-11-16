import {
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Copy,
  ExternalLink,
  Folder,
  MoreHorizontal,
  Plus,
  Settings2,
  Star,
  Trash2,
} from '../icons';
import type { SavedCollection } from '../../shared/preferences';
import {
  folderTree,
  linkCount,
  openFolder,
  setFolderCollapsed,
  subfolders,
} from '../lib/bookmarks';
import {
  collectionNotice,
  favoritesOf,
  mainFolder,
  moveFavorite,
  removeFavorite,
  type Favorite,
} from '../lib/collections';
import { shortHost } from '../lib/format';
import { CHEVRON_CENTER, INDENT, rowBox, rowOffset } from '../lib/trail-rows';
import { showBookmarks } from '../stores/bookmarks-view-store';
import { useDragging, useDropTarget } from '../stores/drag-store';
import {
  selectFlatTrail,
  selectMinimalTrail,
  useShell,
} from '../stores/shell-store';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import type { MenuEntry } from './ContextMenu';
import { SiteIcon } from './Favicon';
import { hostOf, IconStack, openLink, RowChevron } from './IconStack';
import { Reveal } from './Reveal';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14 } as const;

/**
 * Favorites: the sites you keep coming back to, shared by every workspace.
 * They sit as one icon stack among Saved and pop out as a branch of rows like
 * the trail's, with any folders above them, so the trail keeps the sidebar. A page dragged from the
 * trail, or a link dragged from a page or another app, becomes one when
 * dropped on the stack; while one is on its way, the folders appear below the
 * stack to take it instead. In the list they drag into order.
 */
export function Favorites() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const favorites = useMemo(() => favoritesOf(collections), [collections]);
  const loose = useMemo(() => {
    const main = mainFolder(collections);
    return favorites.filter((favorite) => favorite.folderId === main?.id);
  }, [collections, favorites]);
  const dragging = useDragging();
  const target = useDropTarget();
  const over = target?.kind === 'favorites';
  const menu = useSidebarMenu('Bookmark');
  const activeUrl = useShell((state) => {
    const id = state.snapshot?.activePageId;
    return id ? (state.snapshot?.pages[id]?.url ?? null) : null;
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!favorites.length && !dragging) return null;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    // The main folder's links lead Favorites, so their places line up.
    const index = loose.findIndex((f) => f.link.id === over.id);
    if (index !== -1) void moveFavorite(String(active.id), index);
  };

  return (
    <div data-drop="favorites" data-over={over} className="favorites">
      {favorites.length ? (
        <IconStack
          id="favorites"
          name="Bookmarks"
          links={favorites.map((f) => f.link)}
        >
          {subfolders(collections, null).map((folder, index) => (
            <StackFolder
              key={folder.id}
              folder={folder}
              items={collections}
              depth={1}
              index={index}
              activeUrl={activeUrl}
              menu={menu}
            />
          ))}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={loose.map((f) => f.link.id)}
              strategy={verticalListSortingStrategy}
            >
              {loose.map((favorite, index) => (
                <FavoriteLink
                  key={favorite.link.id}
                  favorite={favorite}
                  index={index}
                  current={favorite.link.url === activeUrl}
                  menuOpen={menu.openOn?.dataset.favorite === favorite.link.id}
                  onMenu={(event, anchored) =>
                    menu.show(event, favoriteEntries(favorite), anchored)
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        </IconStack>
      ) : (
        <div className="favorites-empty">
          <Star size={14} aria-hidden />
          Drop here to add to Bookmarks
        </div>
      )}
      {dragging && (
        <div className="folder-drops" aria-hidden>
          {folderTree(collections).map(({ folder, depth }) => (
            <div
              key={folder.id}
              data-drop={`folder:${folder.id}`}
              data-over={target?.kind === 'folder' && target.id === folder.id}
              style={{ '--depth': depth } as CSSProperties}
              className="folder-drop"
            >
              <Folder size={14} aria-hidden />
              <span className="min-w-0 truncate">{folder.name}</span>
            </div>
          ))}
        </div>
      )}
      {menu.element}
    </div>
  );
}

/**
 * One row of the popped-out list, built like a page in the trail: chevron
 * column, icon, title, and its actions at the end on hover. `index` staggers
 * its entrance, so the list deals itself out of the stack from the top.
 */
function FavoriteRow({
  id,
  depth,
  index,
  icon,
  label,
  site,
  tooltip,
  count,
  open,
  current,
  menuOpen,
  actionsLabel,
  rowRef,
  style,
  dragProps,
  onActivate,
  onMiddleClick,
  onMenu,
}: {
  id: string;
  depth: number;
  index: number;
  icon: ReactNode;
  label: string;
  site?: string | null;
  tooltip?: string;
  /** A folder's links, shown while it's folded. */
  count?: number;
  /** Whether a folder is unfolded; links have nothing to unfold. */
  open?: boolean;
  current?: boolean;
  menuOpen: boolean;
  actionsLabel: string;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragProps?: Record<string, unknown>;
  onActivate(event: MouseEvent<HTMLElement>): void;
  onMiddleClick?(): void;
  onMenu(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
}) {
  const flat = useShell(selectFlatTrail);
  const minimal = useShell(selectMinimalTrail);
  const box = rowBox(depth, flat, minimal);
  const folder = open !== undefined;
  return (
    <div
      ref={rowRef}
      className="favorite-row trail-row group relative flex h-(--row-height) shrink-0 items-center gap-2 rounded-row pr-1.5 transition-[background-color,scale] duration-fast ease-out hover:bg-row-hover active:bg-row-pressed data-[menu-open=true]:bg-row-hover"
      data-current={current}
      data-folded={open === false}
      data-menu-open={menuOpen}
      style={
        {
          ...style,
          marginLeft: box.marginLeft,
          '--i': Math.min(index, 12),
        } as CSSProperties
      }
    >
      <BranchLine depth={depth} />
      <button
        type="button"
        {...dragProps}
        className="favorite-row-main"
        data-favorite={id}
        aria-expanded={open}
        aria-label={
          folder
            ? `${label}, ${count} ${count === 1 ? 'page' : 'pages'}`
            : undefined
        }
        aria-current={current ? 'page' : undefined}
        title={tooltip}
        style={{ paddingLeft: box.paddingLeft }}
        onClick={onActivate}
        onAuxClick={(event) => {
          if (event.button === 1) onMiddleClick?.();
        }}
        onContextMenu={(event) => onMenu(event)}
      >
        {!flat &&
          (folder ? (
            <RowChevron open={open} minimal={minimal} />
          ) : (
            <span
              className="grid size-4 shrink-0 place-items-center"
              aria-hidden
            >
              {minimal && <span className="trail-dot" />}
            </span>
          ))}
        <span
          className="favorite-row-icon grid size-4 shrink-0 place-items-center"
          aria-hidden
        >
          {icon}
        </span>
        <span className="trail-label min-w-0 flex-1">
          <span className="trail-title">
            <span className="trail-title-text">{label}</span>
          </span>
          {site && <span className="trail-site text-fg-subtle">{site}</span>}
        </span>
        {folder && flat && <RowChevron open={open} minimal={minimal} />}
        {open === false && (
          <span
            aria-hidden
            className="shrink-0 text-caption text-fg-subtle tabular-nums"
          >
            {count}
          </span>
        )}
      </button>
      <span className="trail-trailing relative -ml-1 grid size-6 shrink-0 place-items-center">
        <button
          type="button"
          data-favorite={id}
          aria-label={actionsLabel}
          title="Actions"
          aria-haspopup="menu"
          onClick={(event) => onMenu(event, true)}
          onContextMenu={(event) => onMenu(event)}
          className="trail-close absolute inset-y-0 right-0 grid w-6 place-items-center rounded-inner text-fg-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-pressed hover:text-fg"
        >
          <MoreHorizontal size={14} />
        </button>
      </span>
    </div>
  );
}

/** The hairline a nested row hangs from, the same as a page's in the trail. */
function BranchLine({ depth }: { depth: number }) {
  const shown = useShell((state) => state.preferences?.showBranchLines ?? true);
  const minimal = useShell(selectMinimalTrail);
  if (depth === 0 || !shown || minimal) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0"
      style={{ left: -rowOffset(depth) }}
    >
      <span
        className="absolute top-0 -bottom-px w-px bg-(--guide)"
        style={{ left: CHEVRON_CENTER + (depth - 1) * INDENT }}
      />
    </span>
  );
}

/** A folder in the popped-out list, unfolding where it sits. */
function StackFolder({
  folder,
  items,
  depth,
  index,
  activeUrl,
  menu,
}: {
  folder: SavedCollection;
  items: SavedCollection[];
  depth: number;
  index: number;
  activeUrl: string | null;
  menu: ReturnType<typeof useSidebarMenu>;
}) {
  const open = !folder.collapsed;
  return (
    <>
      <FavoriteRow
        id={folder.id}
        depth={depth}
        index={index}
        icon={
          <Folder
            open={open}
            size={16}
            fill="currentColor"
            aria-hidden
            className="text-fg-subtle"
          />
        }
        label={folder.name}
        count={linkCount(items, folder.id)}
        open={open}
        menuOpen={menu.openOn?.dataset.favorite === folder.id}
        actionsLabel={`Actions for ${folder.name}`}
        onActivate={() => void setFolderCollapsed(folder.id, open)}
        onMenu={(event, anchored) =>
          menu.show(event, folderEntries(folder), anchored)
        }
      />
      <Reveal show={open}>
        <div
          className="stack-folder-list"
          role="group"
          aria-label={folder.name}
        >
          {subfolders(items, folder.id).map((child, at) => (
            <StackFolder
              key={child.id}
              folder={child}
              items={items}
              depth={depth + 1}
              index={at}
              activeUrl={activeUrl}
              menu={menu}
            />
          ))}
          {folder.links.map((link, at) => (
            <LinkRow
              key={link.id}
              link={link}
              depth={depth + 1}
              index={at}
              current={link.url === activeUrl}
              menuOpen={menu.openOn?.dataset.favorite === link.id}
              onMenu={(event, anchored) =>
                menu.show(
                  event,
                  favoriteEntries({ link, folderId: folder.id }),
                  anchored,
                )
              }
            />
          ))}
        </div>
      </Reveal>
    </>
  );
}

/** A link in the popped-out list. */
function LinkRow({
  link,
  depth,
  index,
  current,
  menuOpen,
  onMenu,
  rowRef,
  style,
  dragProps,
}: {
  link: Favorite['link'];
  depth: number;
  index: number;
  current: boolean;
  menuOpen: boolean;
  onMenu(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragProps?: Record<string, unknown>;
}) {
  const showSite = useShell(
    (state) => state.preferences?.showSiteNames ?? true,
  );
  const site = shortHost(link.url);
  const title = link.title || site;
  return (
    <FavoriteRow
      id={link.id}
      depth={depth}
      index={index}
      icon={<SiteIcon url={link.faviconUrl} site={link.url} />}
      label={title}
      site={showSite && title !== site ? site : null}
      tooltip={`${title}\n${link.url}`}
      current={current}
      menuOpen={menuOpen}
      actionsLabel={`Actions for ${title}`}
      rowRef={rowRef}
      style={style}
      dragProps={dragProps}
      onActivate={(event) => void openLink(link, event.metaKey)}
      onMiddleClick={() => void openLink(link, true)}
      onMenu={onMenu}
    />
  );
}

function folderEntries(folder: SavedCollection): MenuEntry[] {
  return [
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
  ];
}

function FavoriteLink({
  favorite,
  index,
  current,
  menuOpen,
  onMenu,
}: {
  favorite: Favorite;
  index: number;
  current: boolean;
  menuOpen: boolean;
  onMenu(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: favorite.link.id });
  return (
    <LinkRow
      link={favorite.link}
      depth={1}
      index={index}
      current={current}
      menuOpen={menuOpen}
      onMenu={onMenu}
      rowRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      style={{
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    />
  );
}

function favoriteEntries(favorite: Favorite): MenuEntry[] {
  const { link } = favorite;
  return [
    {
      kind: 'action',
      label: 'Open',
      icon: <ExternalLink {...ICON} />,
      run: () => void openLink(favorite.link, false),
    },
    {
      kind: 'action',
      label: 'Open in New Page',
      icon: <Plus {...ICON} />,
      run: () => void openLink(favorite.link, true),
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
  ];
}
