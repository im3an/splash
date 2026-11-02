import { useMemo, type MouseEvent } from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { Copy, ExternalLink, Plus, Star, Trash2 } from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import {
  collectionNotice,
  favoritesOf,
  moveFavorite,
  removeFavorite,
  type Favorite,
} from '../lib/collections';
import { api } from '../splash-api';
import { usePageDrag } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import type { MenuEntry } from './ContextMenu';
import { SiteIcon } from './Favicon';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14, strokeWidth: 1.75 } as const;

/**
 * Arc's favorites: the sites you keep coming back to, as tiles over every
 * workspace's trail. A page dragged from the trail onto them becomes one.
 */
export function Favorites() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const favorites = useMemo(() => favoritesOf(collections), [collections]);
  const dragging = usePageDrag((state) => state.pageId !== null);
  const over = usePageDrag((state) => state.target?.kind === 'favorites');
  const menu = useSidebarMenu('Favorite');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!favorites.length && !dragging) return null;

  const showMenu = (event: MouseEvent<HTMLElement>, favorite: Favorite) =>
    menu.show(event, favoriteEntries(favorite));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const index = favorites.findIndex((f) => f.link.id === over.id);
    if (index !== -1) void moveFavorite(String(active.id), index);
  };

  return (
    <section
      aria-label="Favorites"
      data-drop="favorites"
      data-over={over}
      className="favorites"
    >
      {favorites.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={favorites.map((f) => f.link.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="favorites-grid">
              {favorites.map((favorite) => (
                <FavoriteTile
                  key={favorite.link.id}
                  favorite={favorite}
                  menuOpen={menu.openOn?.dataset.favorite === favorite.link.id}
                  onMenu={showMenu}
                />
              ))}
              {dragging && (
                <li className="favorite-tile favorite-drop" aria-hidden>
                  <Plus size={16} strokeWidth={1.75} />
                </li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="favorites-empty">
          <Star size={14} strokeWidth={1.75} aria-hidden />
          Drop here to add to Favorites
        </div>
      )}
      {menu.element}
    </section>
  );
}

function FavoriteTile({
  favorite,
  menuOpen,
  onMenu,
}: {
  favorite: Favorite;
  menuOpen: boolean;
  onMenu(event: MouseEvent<HTMLElement>, favorite: Favorite): void;
}) {
  const { link } = favorite;
  // The open copy of this site, if the workspace has one.
  const openPage = useShell((state) => {
    const pages = state.snapshot?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages)) {
      if (page.url === link.url) return page;
    }
    return null;
  });
  const current = useShell(
    (state) =>
      openPage !== null && state.snapshot?.activePageId === openPage.id,
  );
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });
  const title = link.title || hostOf(link.url);

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      data-dragging={isDragging}
      className="favorite-cell"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        data-favorite={link.id}
        data-current={current}
        data-open={openPage !== null}
        data-menu-open={menuOpen}
        aria-label={title}
        aria-current={current ? 'page' : undefined}
        title={`${title}\n${link.url}`}
        onClick={() => void openFavorite(favorite, false)}
        onAuxClick={(event) => {
          if (event.button === 1) void openFavorite(favorite, true);
        }}
        onContextMenu={(event) => onMenu(event, favorite)}
        className="favorite-tile"
      >
        <SiteIcon
          url={link.faviconUrl ?? openPage?.faviconUrl}
          fallback={<Monogram url={link.url} />}
        />
      </button>
    </li>
  );
}

/** A site without an icon gets its first letter, never a generic globe. */
function Monogram({ url }: { url: string }) {
  const letter = hostOf(url)
    .replace(/^www\./, '')
    .charAt(0)
    .toUpperCase();
  return (
    <span aria-hidden className="favorite-monogram">
      {letter || '·'}
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Shows the open copy of a favorite, or opens it as a new trail. */
async function openFavorite(favorite: Favorite, fresh: boolean) {
  const snapshot = useShell.getState().snapshot;
  const existing =
    !fresh && snapshot
      ? Object.values(snapshot.pages).find(
          (page) => page.url === favorite.link.url,
        )
      : undefined;
  try {
    if (existing) await api().activatePage(existing.id);
    else await api().createPage(favorite.link.url);
  } catch {
    collectionNotice('Could not open that favorite. Try again.');
  }
}

function favoriteEntries(favorite: Favorite): MenuEntry[] {
  const { link } = favorite;
  return [
    {
      kind: 'action',
      label: 'Open',
      icon: <ExternalLink {...ICON} />,
      run: () => void openFavorite(favorite, false),
    },
    {
      kind: 'action',
      label: 'Open in New Page',
      icon: <Plus {...ICON} />,
      run: () => void openFavorite(favorite, true),
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
      label: 'Remove from Favorites',
      icon: <Trash2 {...ICON} />,
      run: () => void removeFavorite(link.url, link.title || hostOf(link.url)),
    },
  ];
}
