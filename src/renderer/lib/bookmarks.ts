import {
  bookmarkLinks,
  folderTree,
  mainFolder,
  subfolders,
  type SavedLink,
} from '../../shared/bookmarks';
import type { SavedCollection } from '../../shared/preferences';
import type { BrowserSnapshot, PageId } from '../../shared/types';
import { api } from '../splash-api';
import { useToast } from '../stores/toast-store';
import {
  branchPages,
  collectionBranch,
  collectionNotice,
  newFolder,
  updateLibrary,
  webLink,
} from './collections';

export { folderTree, subfolders, type SavedLink };

/** What a bookmark row carries while it's dragged inside Splash. */
export const BOOKMARK_DRAG_TYPE = 'application/x-splash-bookmarks';

/** Some of the library, by id: what a selection, move or delete acts on. */
export interface BookmarkItems {
  linkIds: string[];
  folderIds: string[];
}

export type BookmarkRow =
  | {
      kind: 'folder';
      id: string;
      depth: number;
      folder: SavedCollection;
      /** Links held anywhere inside it. */
      count: number;
    }
  | {
      kind: 'link';
      id: string;
      depth: number;
      link: SavedLink;
      folderId: string;
      /** Named while searching, when the tree isn't there to say. */
      folderName: string | null;
    };

const isFolder = (item: SavedCollection) => item.kind === 'folder';

/** How many links a folder holds, its nested folders included. */
export function linkCount(items: SavedCollection[], folderId: string): number {
  const branch = collectionBranch(items, folderId);
  return items
    .filter((item) => branch.has(item.id))
    .reduce((total, item) => total + item.links.length, 0);
}

export function linksOf(items: SavedCollection[], folderId: string) {
  return items.find((item) => item.id === folderId)?.links ?? [];
}

/**
 * What the manager lists. Browsing, it's the tree with folders first, minus
 * whatever a collapsed folder holds. Searching, it's every match, flat.
 */
export function bookmarkRows(
  items: SavedCollection[],
  query: string,
): BookmarkRow[] {
  const main = mainFolder(items);
  const needle = query.trim().toLowerCase();
  if (needle) {
    const folders: BookmarkRow[] = folderTree(items)
      .filter(({ folder }) => folder.name.toLowerCase().includes(needle))
      .map(({ folder }) => ({
        kind: 'folder',
        id: folder.id,
        depth: 0,
        folder,
        count: linkCount(items, folder.id),
      }));
    const links: BookmarkRow[] = bookmarkLinks(items)
      .filter(({ link }) =>
        `${link.title} ${link.url}`.toLowerCase().includes(needle),
      )
      .map(({ link, folderId, folderName }) => ({
        kind: 'link',
        id: link.id,
        depth: 0,
        link,
        folderId,
        folderName,
      }));
    return [...folders, ...links];
  }
  const linkRows = (folder: SavedCollection, depth: number): BookmarkRow[] =>
    folder.links.map((link) => ({
      kind: 'link',
      id: link.id,
      depth,
      link,
      folderId: folder.id,
      folderName: null,
    }));
  const walk = (parentId: string | null, depth: number): BookmarkRow[] =>
    subfolders(items, parentId).flatMap((folder) => [
      {
        kind: 'folder' as const,
        id: folder.id,
        depth,
        folder,
        count: linkCount(items, folder.id),
      },
      ...(folder.collapsed
        ? []
        : [...walk(folder.id, depth + 1), ...linkRows(folder, depth + 1)]),
    ]);
  return [...walk(null, 0), ...(main ? linkRows(main, 0) : [])];
}

/**
 * Adds links to a folder (null is the top level), skipping addresses it
 * already holds. A folder that has gone takes nothing.
 */
export function addLinks(
  items: SavedCollection[],
  folderId: string | null,
  links: SavedLink[],
): { items: SavedCollection[]; added: number } {
  const target = folderId
    ? items.find((item) => item.id === folderId && isFolder(item))
    : mainFolder(items);
  if (folderId && !target) return { items, added: 0 };
  const seen = new Set(target?.links.map((link) => link.url));
  const fresh = links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
  if (!fresh.length) return { items, added: 0 };
  if (!target)
    return { items: [...items, newFolder(fresh)], added: fresh.length };
  return {
    items: items.map((item) =>
      item === target
        ? { ...item, collapsed: false, links: [...item.links, ...fresh] }
        : item,
    ),
    added: fresh.length,
  };
}

export function createFolder(
  items: SavedCollection[],
  id: string,
  name: string,
  parentId: string | null,
): SavedCollection[] {
  return [
    ...items,
    { id, name, kind: 'folder', parentId, collapsed: false, links: [] },
  ];
}

/**
 * Drops whatever a chosen folder already holds: it goes with the folder, and
 * shouldn't be pulled out of it. Select All picks both.
 */
export function outermost(
  items: SavedCollection[],
  { linkIds, folderIds }: BookmarkItems,
): BookmarkItems {
  const inside = new Set(
    folderIds.flatMap((id) =>
      [...collectionBranch(items, id)].filter((value) => value !== id),
    ),
  );
  const chosen = new Set(folderIds);
  const held = new Set(
    items
      .filter((item) => chosen.has(item.id) || inside.has(item.id))
      .flatMap((item) => item.links.map((link) => link.id)),
  );
  return {
    linkIds: linkIds.filter((id) => !held.has(id)),
    folderIds: folderIds.filter((id) => !inside.has(id)),
  };
}

/** Moves links and folders into a folder; null is the top level. */
export function moveItems(
  items: SavedCollection[],
  selection: BookmarkItems,
  targetId: string | null,
): SavedCollection[] {
  const { linkIds, folderIds } = outermost(items, selection);
  const moving = new Set(linkIds);
  const target = targetId
    ? items.find((item) => item.id === targetId)
    : mainFolder(items);
  // A folder can't go inside itself or anything it holds.
  const folders = new Set(
    folderIds.filter(
      (id) => !targetId || !collectionBranch(items, id).has(targetId),
    ),
  );
  if (target) for (const link of target.links) moving.delete(link.id);
  const links = items.flatMap((item) =>
    item.links.filter((link) => moving.has(link.id)),
  );
  const moved = items.map((item) => {
    const kept = item.links.filter((link) => !moving.has(link.id));
    return {
      ...item,
      links: kept.length === item.links.length ? item.links : kept,
      parentId: folders.has(item.id) ? targetId : item.parentId,
    };
  });
  if (!links.length) return moved;
  return addLinks(moved, targetId, links).items;
}

/**
 * Sends what was moved back to where it was in `before`, keeping anything else
 * that has changed since: undo can come well after the move, by ⌘Z.
 */
export function undoMove(
  items: SavedCollection[],
  before: SavedCollection[],
  selection: BookmarkItems,
): SavedCollection[] {
  const { linkIds, folderIds } = outermost(before, selection);
  const { removed } = removeItems(before, { linkIds, folderIds: [] });
  const parents = new Map(
    before
      .filter((item) => folderIds.includes(item.id))
      .map((item) => [item.id, item.parentId]),
  );
  const { items: without } = removeItems(items, { linkIds, folderIds: [] });
  return restoreItems(without, removed).map((item) =>
    parents.has(item.id) ? { ...item, parentId: parents.get(item.id) } : item,
  );
}

/** Where some folders can move to: anywhere but their own branches. */
export function moveTargets(
  items: SavedCollection[],
  folderIds: string[],
): { id: string | null; name: string; depth: number }[] {
  const barred = new Set(
    folderIds.flatMap((id) => [...collectionBranch(items, id)]),
  );
  return [
    { id: null, name: 'Bookmarks', depth: 0 },
    ...folderTree(items)
      .filter(({ folder }) => !barred.has(folder.id))
      .map(({ folder, depth }) => ({
        id: folder.id,
        name: folder.name,
        depth,
      })),
  ];
}

export interface RemovedBookmarks {
  folders: { item: SavedCollection; index: number }[];
  links: { folderId: string; link: SavedLink; index: number }[];
  /** How many links went, those inside removed folders included. */
  count: number;
}

/** Takes links and folders out, keeping what's needed to put them back. */
export function removeItems(
  items: SavedCollection[],
  { linkIds, folderIds }: BookmarkItems,
): { items: SavedCollection[]; removed: RemovedBookmarks } {
  const branch = new Set(
    folderIds.flatMap((id) => [...collectionBranch(items, id)]),
  );
  const ids = new Set(linkIds);
  const removed: RemovedBookmarks = { folders: [], links: [], count: 0 };
  items.forEach((item, index) => {
    if (branch.has(item.id)) {
      removed.folders.push({ item, index });
      removed.count += item.links.length;
      return;
    }
    item.links.forEach((link, at) => {
      if (!ids.has(link.id)) return;
      removed.links.push({ folderId: item.id, link, index: at });
      removed.count += 1;
    });
  });
  return {
    items: items
      .filter((item) => !branch.has(item.id))
      .map((item) =>
        item.links.some((link) => ids.has(link.id))
          ? { ...item, links: item.links.filter((link) => !ids.has(link.id)) }
          : item,
      ),
    removed,
  };
}

/** Puts removed bookmarks back where they were, keeping changes since. */
export function restoreItems(
  items: SavedCollection[],
  removed: RemovedBookmarks,
): SavedCollection[] {
  const restored = [...items];
  for (const { item, index } of removed.folders) {
    if (restored.some((value) => value.id === item.id)) continue;
    restored.splice(Math.min(index, restored.length), 0, item);
  }
  return restored.map((item) => {
    const missing = removed.links.filter(
      ({ folderId, link }) =>
        folderId === item.id &&
        !item.links.some((value) => value.id === link.id),
    );
    if (!missing.length) return item;
    const links = [...item.links];
    for (const { link, index } of missing)
      links.splice(Math.min(index, links.length), 0, link);
    return { ...item, links };
  });
}

/** Each web page of a branch once, in trail order. */
export function branchLinks(
  snapshot: BrowserSnapshot,
  pageId: PageId,
): SavedLink[] {
  const seen = new Set<string>();
  return branchPages(snapshot, pageId).flatMap((id) => {
    const page = snapshot.pages[id];
    const link = page ? webLink(page) : null;
    if (!link || seen.has(link.url)) return [];
    seen.add(link.url);
    return [link];
  });
}

const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
const BARE_HOST = /^[a-z\d-]+(\.[a-z\d-]+)*\.[a-z]{2,63}(:\d+)?([/?#]|$)/i;
const MAX_URL = 8192;

function webAddress(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > MAX_URL || /\s/.test(value)) return null;
  if (!SCHEME.test(value) && !BARE_HOST.test(value)) return null;
  try {
    const url = new URL(SCHEME.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * The link's own words, from the markup a link drag carries. DOMParser builds
 * an inert document: nothing in it runs or loads.
 */
function droppedTitle(html: string): string | null {
  if (!html) return null;
  const anchor = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('a');
  const text = anchor?.textContent?.replace(/\s+/g, ' ').trim();
  return text || null;
}

/** The web address a drag carries, if it carries one. */
export function parseDroppedLink(
  read: (type: string) => string,
): { url: string; title: string } | null {
  const listed = read('text/uri-list')
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.startsWith('#'));
  const url = webAddress(listed ?? '') ?? webAddress(read('text/plain'));
  if (!url) return null;
  const title =
    droppedTitle(read('text/html')) ??
    new URL(url).hostname.replace(/^www\./, '');
  return { url, title: title.slice(0, 300) };
}

function folderLabel(items: SavedCollection[], folderId: string | null) {
  return (
    (folderId && items.find((item) => item.id === folderId)?.name) ||
    'Bookmarks'
  );
}

/** Files one link in a folder, and says so; null is the top level. */
export async function fileLink(link: SavedLink, folderId: string | null) {
  let added = 0;
  let where = 'Bookmarks';
  const saved = await updateLibrary((items) => {
    const result = addLinks(items, folderId, [link]);
    added = result.added;
    where = folderLabel(items, folderId);
    return result.items;
  });
  if (saved)
    collectionNotice(
      added
        ? `Added ${link.title} to ${where}.`
        : `${link.title} is already in ${where}.`,
    );
}

export function setFolderCollapsed(id: string, collapsed: boolean) {
  return updateLibrary((items) =>
    items.map((item) => (item.id === id ? { ...item, collapsed } : item)),
  );
}

export function renameFolder(id: string, name: string) {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return Promise.resolve(false);
  return updateLibrary((items) =>
    items.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
  );
}

export function setBookmarksBar(bookmarksBar: boolean) {
  void api()
    .updatePreferences({ bookmarksBar })
    .catch(() =>
      collectionNotice('Could not change the bookmarks bar. Try again.'),
    );
}

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

/** Describes some of the library for a message: "2 bookmarks and a folder". */
export function describeItems({ linkIds, folderIds }: BookmarkItems): string {
  const parts = [
    linkIds.length && plural(linkIds.length, 'bookmark'),
    folderIds.length && plural(folderIds.length, 'folder'),
  ].filter(Boolean);
  return parts.join(' and ');
}

export async function moveBookmarks(
  selection: BookmarkItems,
  targetId: string | null,
) {
  let where = 'Bookmarks';
  let what = '';
  let before: SavedCollection[] = [];
  let changed = false;
  const saved = await updateLibrary((items) => {
    before = items;
    where = folderLabel(items, targetId);
    what = describeItems(outermost(items, selection));
    const moved = moveItems(items, selection, targetId);
    changed = JSON.stringify(moved) !== JSON.stringify(items);
    return moved;
  });
  if (!saved || !changed) return;
  useToast.getState().show({
    message: `Moved ${what} to ${where}`,
    detail: null,
    durationMs: 7000,
    actions: [
      {
        label: 'Undo',
        icon: 'undo',
        run: () =>
          void updateLibrary((items) => undoMove(items, before, selection)),
      },
    ],
  });
}

/** Deletes links and folders, offering Undo instead of asking first. */
export async function deleteBookmarks(selection: BookmarkItems) {
  let taken: RemovedBookmarks = { folders: [], links: [], count: 0 };
  let folders = 0;
  const saved = await updateLibrary((items) => {
    const result = removeItems(items, selection);
    taken = result.removed;
    folders = outermost(items, selection).folderIds.length;
    return result.items;
  });
  if (!saved) return;
  const parts = [
    folders && plural(folders, 'folder'),
    (taken.count || !folders) && plural(taken.count, 'bookmark'),
  ].filter(Boolean);
  useToast.getState().show({
    message: `Deleted ${parts.join(' and ')}`,
    detail: null,
    durationMs: 7000,
    actions: [
      {
        label: 'Undo',
        icon: 'undo',
        run: () => void updateLibrary((items) => restoreItems(items, taken)),
      },
    ],
  });
}

/** Opens each link a folder holds directly, each as a new page. */
export async function openFolder(folder: SavedCollection) {
  try {
    for (const link of folder.links) await api().createPage(link.url);
  } catch {
    collectionNotice(`Could not open every page in ${folder.name}. Try again.`);
  }
}

/**
 * Files a branch as a new folder named for its first page. It starts folded,
 * so a long branch doesn't take over the list.
 */
export async function bookmarkBranch(
  snapshot: BrowserSnapshot,
  pageId: PageId,
  name: string,
  show: (folderId: string) => void,
) {
  const links = branchLinks(snapshot, pageId);
  if (!links.length) {
    collectionNotice('This branch has no web pages to bookmark.');
    return;
  }
  const id = crypto.randomUUID();
  const label = name.trim().slice(0, 100) || 'Branch';
  const saved = await updateLibrary((items) => [
    ...items,
    { id, name: label, kind: 'folder', parentId: null, collapsed: true, links },
  ]);
  if (!saved) return;
  useToast.getState().show({
    message: `Bookmarked ${plural(links.length, 'page')} in ${label}`,
    detail: null,
    durationMs: 7000,
    actions: [
      {
        label: 'Undo',
        icon: 'undo',
        run: () =>
          void updateLibrary((items) => items.filter((item) => item.id !== id)),
      },
      { label: 'Show', run: () => show(id) },
    ],
  });
}
