import type { SavedCollection } from './preferences';

/**
 * The shape of the bookmark library, for both the manager and the main
 * process's search. A link lives in one folder. Links in the main folder
 * ("Bookmarks") are the top level, so the main folder never shows as a folder
 * itself: every other one sits at or under the top level beside them.
 */

export type SavedLink = SavedCollection['links'][number];

/** One bookmark and the folder that holds it. */
export interface BookmarkLink {
  link: SavedLink;
  folderId: string;
  /** Null at the top level, which isn't a folder to anyone looking. */
  folderName: string | null;
}

/** Where new favorites go. Its links are the library's top level. */
export function mainFolder(items: readonly SavedCollection[]) {
  return items.find(
    (item) =>
      item.kind === 'folder' && item.name === 'Bookmarks' && !item.parentId,
  );
}

/** Every folder but the main one, under the folder it sits in. */
function foldersByPlace(
  items: readonly SavedCollection[],
): Map<string | null, SavedCollection[]> {
  const main = mainFolder(items);
  const ids = new Set(items.map((item) => item.id));
  const places = new Map<string | null, SavedCollection[]>();
  for (const item of items) {
    if (item.kind !== 'folder' || item === main) continue;
    const parent =
      item.parentId && ids.has(item.parentId) ? item.parentId : null;
    // The main folder is the top level, so what's inside it is too.
    const place = parent === main?.id ? null : parent;
    places.set(place, [...(places.get(place) ?? []), item]);
  }
  return places;
}

/** The folders directly under a folder; null is the top level. */
export function subfolders(
  items: readonly SavedCollection[],
  parentId: string | null,
): SavedCollection[] {
  return foldersByPlace(items).get(parentId) ?? [];
}

/** Every folder but the main one, each after its parent. */
export function folderTree(
  items: readonly SavedCollection[],
): { folder: SavedCollection; depth: number }[] {
  const places = foldersByPlace(items);
  const walk = (
    parentId: string | null,
    depth: number,
  ): { folder: SavedCollection; depth: number }[] =>
    (places.get(parentId) ?? []).flatMap((folder) => [
      { folder, depth },
      ...walk(folder.id, depth + 1),
    ]);
  return walk(null, 0);
}

/** Every bookmark in the library, nested folders first, the top level last. */
export function bookmarkLinks(
  items: readonly SavedCollection[],
): BookmarkLink[] {
  const main = mainFolder(items);
  const holders = [
    ...folderTree(items).map(({ folder }) => folder),
    ...(main ? [main] : []),
  ];
  return holders.flatMap((folder) =>
    folder.links.map((link) => ({
      link,
      folderId: folder.id,
      folderName: folder === main ? null : folder.name,
    })),
  );
}
