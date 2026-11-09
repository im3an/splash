import {
  MAX_COLLECTIONS,
  MAX_LINKS_PER_FOLDER,
  type Preferences,
} from '../../shared/preferences';

/** A browser's bookmarks, whichever file they came from. */
export type BookmarkNode =
  | { type: 'folder'; name: string; children: BookmarkNode[] }
  | { type: 'link'; title: string; url: string };

type Collection = Preferences['collections'][number];

const MAX_NAME = 100;
const MAX_TITLE = 300;
const MAX_URL = 8192;

/** Only addresses the library can hold, so a `javascript:` bookmarklet can't. */
export function isBookmarkUrl(url: string): boolean {
  if (url.length > MAX_URL) return false;
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function countLinks(nodes: readonly BookmarkNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === 'link' ? 1 : countLinks(node.children)),
    0,
  );
}

export interface MergedBookmarks {
  collections: Collection[];
  /** The folder holding everything brought in, to take it back out again. */
  rootId: string;
  added: number;
  /** Addresses already in the library. */
  duplicates: number;
  /** Bookmarklets, `file:` and other addresses a bookmark can't be. */
  unsupported: number;
  /** Past the library's limits. */
  overLimit: number;
}

const folderName = (name: string) =>
  name.trim().slice(0, MAX_NAME) || 'Untitled folder';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Adds a browser's bookmarks to the library in one new folder, keeping their
 * folders inside it. Nothing already in the library changes, and an address
 * it already has is left out. Empty folders aren't brought over.
 */
export function mergeBookmarks(
  existing: readonly Collection[],
  nodes: readonly BookmarkNode[],
  rootName: string,
  createId: () => string,
): MergedBookmarks {
  const seen = new Set(
    existing.flatMap((collection) => collection.links.map((link) => link.url)),
  );
  const added: Collection[] = [];
  const result = { added: 0, duplicates: 0, unsupported: 0, overLimit: 0 };
  const rootId = createId();

  const hasRoom = () => existing.length + added.length < MAX_COLLECTIONS;

  /** Links go in `folder`; returns whether anything ended up beneath it. */
  const fill = (folder: Collection, children: readonly BookmarkNode[]) => {
    let kept = false;
    for (const node of children) {
      if (node.type === 'link') {
        if (!isBookmarkUrl(node.url)) {
          result.unsupported += 1;
        } else if (seen.has(node.url)) {
          result.duplicates += 1;
        } else if (folder.links.length >= MAX_LINKS_PER_FOLDER) {
          result.overLimit += 1;
        } else {
          seen.add(node.url);
          folder.links.push({
            id: createId(),
            title: (node.title.trim() || hostOf(node.url)).slice(0, MAX_TITLE),
            url: node.url,
          });
          result.added += 1;
          kept = true;
        }
        continue;
      }
      if (!hasRoom()) {
        result.overLimit += countLinks(node.children);
        continue;
      }
      const child: Collection = {
        id: createId(),
        name: folderName(node.name),
        kind: 'folder',
        collapsed: true,
        parentId: folder.id,
        links: [],
      };
      const slot = added.length;
      added.push(child);
      if (fill(child, node.children)) kept = true;
      // Nothing came of it, and nothing beneath it, so leave it out.
      else added.splice(slot);
    }
    return kept;
  };

  const root: Collection = {
    id: rootId,
    name: folderName(rootName),
    kind: 'folder',
    collapsed: true,
    parentId: null,
    links: [],
  };
  if (!hasRoom()) {
    return {
      collections: [...existing],
      rootId,
      ...result,
      overLimit: countLinks(nodes),
    };
  }
  added.push(root);
  const kept = fill(root, nodes);
  return {
    collections: kept ? [...existing, ...added] : [...existing],
    rootId,
    ...result,
  };
}

/** Takes a folder and everything beneath it back out of the library. */
export function withoutFolder(
  collections: readonly Collection[],
  folderId: string,
): Collection[] {
  const gone = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const collection of collections) {
      if (
        collection.parentId &&
        gone.has(collection.parentId) &&
        !gone.has(collection.id)
      ) {
        gone.add(collection.id);
        grew = true;
      }
    }
  }
  return collections.filter((collection) => !gone.has(collection.id));
}

/** The library as a tree, in its own order. Groups of pages aren't bookmarks. */
export function libraryTree(
  collections: readonly Collection[],
): BookmarkNode[] {
  const folders = collections.filter(({ kind }) => kind === 'folder');
  const contents = (folder: Collection): BookmarkNode[] => [
    ...folder.links.map(
      (link): BookmarkNode => ({
        type: 'link',
        title: link.title,
        url: link.url,
      }),
    ),
    ...childrenOf(folder.id),
  ];
  const childrenOf = (parentId: string | null): BookmarkNode[] =>
    folders
      .filter((folder) => (folder.parentId ?? null) === parentId)
      .flatMap((folder): BookmarkNode[] =>
        // The root-level "Bookmarks" folder is the library's top level.
        parentId === null && folder.name === 'Bookmarks'
          ? contents(folder)
          : [{ type: 'folder', name: folder.name, children: contents(folder) }],
      );
  return childrenOf(null);
}
