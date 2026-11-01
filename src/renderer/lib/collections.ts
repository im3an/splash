import type { Preferences, SavedCollection } from '../../shared/preferences';
import type { PageSnapshot } from '../../shared/types';
import { api } from '../splash-api';
import { useToast } from '../stores/toast-store';

export function collectionNotice(message: string) {
  useToast
    .getState()
    .show({ message, detail: null, actions: [], durationMs: 4500 });
}
let pending = Promise.resolve();
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
      : items.find(
          (item) => item.kind === 'folder' && item.name === 'Bookmarks',
        );
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
    return removed.length
      ? items.map((item) =>
          item.kind === 'folder'
            ? { ...item, links: item.links.filter((link) => link.url !== url) }
            : item,
        )
      : addBookmark(items, page);
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
        run: () => {
          void updateLibrary((items) => {
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
          });
        },
      },
    ],
  });
}

function addBookmark(
  items: SavedCollection[],
  page: PageSnapshot,
): SavedCollection[] {
  const link = webLink(page)!;
  const folder = items.find(
    (item) => item.kind === 'folder' && item.name === 'Bookmarks',
  );
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
