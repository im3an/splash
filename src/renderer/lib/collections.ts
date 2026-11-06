import { mainFolder } from '../../shared/bookmarks';
import type { Preferences, SavedCollection } from '../../shared/preferences';
import type { BrowserSnapshot, PageId, PageSnapshot } from '../../shared/types';
import { api } from '../splash-api';
import { useToast } from '../stores/toast-store';

export { mainFolder };

export function collectionNotice(message: string) {
  useToast
    .getState()
    .show({ message, detail: null, actions: [], durationMs: 4500 });
}
let pending = Promise.resolve();
/** For undo and redo: a change that didn't save counts as having failed. */
export async function changeLibrary(
  change: (items: SavedCollection[]) => SavedCollection[],
): Promise<void> {
  if (!(await updateLibrary(change))) throw new Error('Not saved');
}

export function updateLibrary(
  change: (items: SavedCollection[]) => SavedCollection[],
) {
  const operation = pending
    .then(async () => {
      const preferences = await api().getPreferences();
      await api().updatePreferences({
        collections: change(preferences.collections ?? []),
      });
      return true;
    })
    .catch(() => {
      collectionNotice('Could not save bookmarks. Try again.');
      return false;
    });
  pending = operation.then(() => undefined);
  return operation;
}
export function webLink(page: PageSnapshot) {
  if (!page.url || !/^https?:\/\//i.test(page.url)) return null;
  return {
    id: crypto.randomUUID(),
    title: (page.customTitle ?? page.title ?? page.url).slice(0, 300),
    url: page.url,
    faviconUrl:
      page.faviconUrl && page.faviconUrl.length <= 8192
        ? page.faviconUrl
        : null,
  };
}
export function bookmarkPage(page: PageSnapshot, folderId?: string) {
  const link = webLink(page);
  if (!link) return Promise.resolve();
  return updateLibrary((items) => {
    const target = folderId
      ? items.find((item) => item.id === folderId)
      : mainFolder(items);
    if (target)
      return items.map((item) =>
        item.id === target.id
          ? {
              ...item,
              collapsed: false,
              links: item.links.some((saved) => saved.url === link.url)
                ? item.links
                : [...item.links, link],
            }
          : item,
      );
    return [
      ...items,
      {
        id: crypto.randomUUID(),
        name: 'Bookmarks',
        kind: 'folder',
        collapsed: false,
        links: [link],
      },
    ];
  });
}
function withoutLink(
  items: SavedCollection[],
  url: string | null,
): SavedCollection[] {
  return items.map((item) =>
    item.kind === 'folder'
      ? { ...item, links: item.links.filter((link) => link.url !== url) }
      : item,
  );
}

export async function toggleBookmark(page: PageSnapshot) {
  const url = page.url;
  if (!webLink(page)) return;
  let removed: SavedCollection[] = [];
  const saved = await updateLibrary((items) => {
    removed = items
      .filter(
        (item) =>
          item.kind === 'folder' && item.links.some((link) => link.url === url),
      )
      .map((item) => ({
        ...item,
        links: item.links.filter((link) => link.url === url),
      }));
    return removed.length ? withoutLink(items, url) : addBookmark(items, page);
  });
  if (!saved) return;
  if (!removed.length) {
    collectionNotice('Bookmark saved.');
    return;
  }
  useToast.getState().show({
    message: 'Bookmark removed',
    detail: null,
    durationMs: 7000,
    actions: [
      {
        label: 'Undo',
        icon: 'undo',
        run: () =>
          changeLibrary((items) => {
            const restored = items.map((item) => {
              const original = removed.find((value) => value.id === item.id);
              return original
                ? {
                    ...item,
                    links: [
                      ...item.links,
                      ...original.links.filter(
                        (link) =>
                          !item.links.some((value) => value.id === link.id),
                      ),
                    ],
                  }
                : item;
            });
            return [
              ...restored,
              ...removed
                .filter(
                  (original) => !items.some((item) => item.id === original.id),
                )
                .map((original) => ({
                  ...original,
                  parentId:
                    original.parentId &&
                    items.some((item) => item.id === original.parentId)
                      ? original.parentId
                      : null,
                })),
            ];
          }),
        redo: () => changeLibrary((items) => withoutLink(items, url)),
      },
    ],
  });
}

function addBookmark(
  items: SavedCollection[],
  page: PageSnapshot,
): SavedCollection[] {
  const link = webLink(page)!;
  const folder = mainFolder(items);
  return folder
    ? items.map((item) =>
        item === folder
          ? { ...item, links: [...item.links, link], collapsed: false }
          : item,
      )
    : [
        ...items,
        {
          id: crypto.randomUUID(),
          name: 'Bookmarks',
          kind: 'folder',
          collapsed: false,
          links: [link],
        },
      ];
}
export function saveToolbar(patch: Partial<Preferences>) {
  void api()
    .updatePreferences(patch)
    .catch(() => collectionNotice('Could not save toolbar. Try again.'));
}

/** A saved link as Favorites shows it, with the folder that holds it. */
export interface Favorite {
  link: SavedCollection['links'][number];
  folderId: string;
}

/**
 * Favorites are every bookmarked link, in folder order, each address once.
 * Bookmark folders from before Favorites still count; new ones go to the
 * "Bookmarks" folder.
 */
export function favoritesOf(items: SavedCollection[]): Favorite[] {
  const seen = new Set<string>();
  const favorites: Favorite[] = [];
  const main = mainFolder(items);
  // The main folder first: that's where new favorites and moves go.
  const folders = [
    ...(main ? [main] : []),
    ...items.filter((item) => item.kind === 'folder' && item !== main),
  ];
  for (const folder of folders) {
    for (const link of folder.links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      favorites.push({ link, folderId: folder.id });
    }
  }
  return favorites;
}

/**
 * Puts a favorite at `index` among the favorites. It moves into the main
 * folder, which holds the order, so it leaves any older folder.
 */
export function moveFavorite(linkId: string, index: number) {
  return updateLibrary((items) => {
    const favorites = favoritesOf(items);
    const moving = favorites.find((favorite) => favorite.link.id === linkId);
    if (!moving) return items;
    const others = favorites.filter((favorite) => favorite !== moving);
    // Its new neighbour decides where it goes in the main folder.
    const before = others[index]?.link;
    const withoutIt = items.map((item) =>
      item.links.some((link) => link.id === linkId)
        ? { ...item, links: item.links.filter((link) => link.id !== linkId) }
        : item,
    );
    const main = mainFolder(withoutIt);
    const place = (links: SavedCollection['links']) => {
      const at = before
        ? links.findIndex((link) => link.url === before.url)
        : -1;
      const next = [...links];
      next.splice(at === -1 ? next.length : at, 0, moving.link);
      return next;
    };
    if (main)
      return withoutIt.map((item) =>
        item.id === main.id ? { ...item, links: place(item.links) } : item,
      );
    return [...withoutIt, newFolder([moving.link])];
  });
}

/** Removes every saved copy of an address from Bookmarks, with Undo. */
export async function removeFavorite(url: string, title: string) {
  let before: SavedCollection[] = [];
  const saved = await updateLibrary((items) => {
    before = items;
    return withoutLink(items, url);
  });
  if (!saved) return;
  useToast.getState().show({
    message: `Removed ${title} from Bookmarks`,
    detail: null,
    durationMs: 7000,
    actions: [
      {
        label: 'Undo',
        icon: 'undo',
        run: () =>
          changeLibrary((items) =>
            items.map((item) => {
              const original = before.find((value) => value.id === item.id);
              if (!original || item.kind !== 'folder') return item;
              const links = [...item.links];
              // Each goes back to where it was among the links still there.
              original.links.forEach((link, at) => {
                if (link.url !== url) return;
                if (links.some((value) => value.id === link.id)) return;
                links.splice(Math.min(at, links.length), 0, link);
              });
              return { ...item, links };
            }),
          ),
        redo: () =>
          changeLibrary((items) => {
            before = items;
            return withoutLink(items, url);
          }),
      },
    ],
  });
}

/** Renames a saved link wherever it is saved. */
export function renameSavedLink(linkId: string, title: string) {
  return updateLibrary((items) =>
    items.map((item) =>
      item.links.some((link) => link.id === linkId)
        ? {
            ...item,
            links: item.links.map((link) =>
              link.id === linkId
                ? { ...link, title: title.slice(0, 300) }
                : link,
            ),
          }
        : item,
    ),
  );
}

export function newFolder(links: SavedCollection['links']): SavedCollection {
  return {
    id: crypto.randomUUID(),
    name: 'Bookmarks',
    kind: 'folder',
    parentId: null,
    collapsed: false,
    links,
  };
}

/** A page and the pages beneath it, in trail order. */
export function branchPages(snapshot: BrowserSnapshot, id: PageId): PageId[] {
  const page = snapshot.pages[id];
  if (!page) return [];
  return [
    id,
    ...page.childIds.flatMap((child) => branchPages(snapshot, child)),
  ];
}

/** Includes a folder and every nested folder/group without recursive loops. */
export function collectionBranch(
  items: SavedCollection[],
  id: string,
): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items)
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
  }
  return ids;
}
