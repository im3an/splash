import { useMemo, type CSSProperties, type MouseEvent } from 'react';
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
  Plus,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import { folderTree } from '../lib/bookmarks';
import {
  collectionNotice,
  favoritesOf,
  moveFavorite,
  removeFavorite,
  type Favorite,
} from '../lib/collections';
import { showBookmarks } from '../stores/bookmarks-view-store';
import { useDragging, useDropTarget } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import type { MenuEntry } from './ContextMenu';
import { hostOf, IconStack, openLink, StackLink } from './IconStack';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14, strokeWidth: 1.75 } as const;

/**
 * Favorites: the sites you keep coming back to, shared by every workspace.
 * They sit as one icon stack among Saved and pop out as a list, so the
 * trail keeps the sidebar. A page dragged from the trail onto the stack
 * becomes one; in the list they drag into order.
 */
export function Favorites() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const favorites = useMemo(() => favoritesOf(collections), [collections]);
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
    const index = favorites.findIndex((f) => f.link.id === over.id);
    if (index !== -1) void moveFavorite(String(active.id), index);
  };

  return (
    <div data-drop="favorites" data-over={over} className="favorites">
      {favorites.length ? (
        <IconStack
          id="favorites"
          name="Bookmarks"
          label="Saved pages"
          links={favorites.map((f) => f.link)}
          menuOpen={false}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={favorites.map((f) => f.link.id)}
              strategy={verticalListSortingStrategy}
            >
              {favorites.map((favorite, index) => (
                <FavoriteLink
                  key={favorite.link.id}
                  favorite={favorite}
                  index={index}
                  current={favorite.link.url === activeUrl}
                  menuOpen={menu.openOn?.dataset.favorite === favorite.link.id}
                  onMenu={(event) =>
                    menu.show(event, favoriteEntries(favorite))
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        </IconStack>
      ) : (
        <div className="favorites-empty">
          <Star size={14} strokeWidth={1.75} aria-hidden />
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
  onMenu(event: MouseEvent<HTMLElement>): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: favorite.link.id });
  return (
    <div ref={setNodeRef}>
      <StackLink
        link={favorite.link}
        index={index}
        current={current}
        menuOpen={menuOpen}
        onOpen={(fresh) => void openLink(favorite.link, fresh)}
        onMenu={onMenu}
        dragProps={{
          ...attributes,
          ...listeners,
          'data-favorite': favorite.link.id,
        }}
        style={{
          transform: transform
            ? `translate3d(0, ${transform.y}px, 0)`
            : undefined,
          transition,
        }}
      />
    </div>
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
