import type { DatabaseSync } from 'node:sqlite';
import { isNavigableUrl } from '../browser/url';
import type { HistoryRow } from '../storage/trail-store';
import type { BookmarkNode } from './bookmark-tree';
import { appleTimeToMs, type PlistValue } from './plist';

/** The most history one import brings in, newest first. */
export const MAX_IMPORTED_HISTORY = 200_000;

/**
 * Microseconds between 1601, when Chromium's clock starts, and 1970. Its times
 * are too large for a JavaScript number, so they're converted in SQL.
 */
const CHROMIUM_EPOCH_OFFSET_US = 11_644_473_600_000_000;

function historyRow(
  url: unknown,
  title: unknown,
  visitCount: unknown,
  lastVisitedAt: number,
): HistoryRow | null {
  if (typeof url !== 'string' || !isNavigableUrl(url)) return null;
  if (!Number.isFinite(lastVisitedAt) || lastVisitedAt <= 0) return null;
  return {
    url,
    title: typeof title === 'string' ? title.slice(0, 500) : '',
    visitCount:
      typeof visitCount === 'number' && visitCount > 0
        ? Math.floor(visitCount)
        : 1,
    lastVisitedAt: Math.round(lastVisitedAt),
  };
}

const keepRows = (rows: (HistoryRow | null)[]) =>
  rows.filter((row): row is HistoryRow => row !== null);

/* Chrome, Brave, Edge, Arc and the rest of the family. */

interface ChromiumNode {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  children?: unknown;
}

function chromiumNode(node: ChromiumNode): BookmarkNode | null {
  const name = typeof node.name === 'string' ? node.name : '';
  if (node.type === 'url' && typeof node.url === 'string') {
    return { type: 'link', title: name, url: node.url };
  }
  if (node.type === 'folder' && Array.isArray(node.children)) {
    return {
      type: 'folder',
      name,
      children: (node.children as ChromiumNode[])
        .map(chromiumNode)
        .filter((child) => child !== null),
    };
  }
  return null;
}

/** The `Bookmarks` file in a Chromium profile, without its version details. */
export function parseChromiumBookmarks(json: string): BookmarkNode[] {
  const parsed = JSON.parse(json) as {
    roots?: Record<string, ChromiumNode>;
  };
  const roots = parsed.roots ?? {};
  const nodes: BookmarkNode[] = [];
  // Its fixed folders, in the order Chrome shows them.
  for (const key of ['bookmark_bar', 'other', 'synced']) {
    const root = roots[key];
    if (root) {
      const node = chromiumNode(root);
      if (node) nodes.push(node);
    }
  }
  return nodes;
}

export function readChromiumHistory(db: DatabaseSync): HistoryRow[] {
  const rows = db
    .prepare(
      `SELECT url, title, visit_count,
         (last_visit_time - ${CHROMIUM_EPOCH_OFFSET_US}) / 1000 AS visited_at
       FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?`,
    )
    .all(MAX_IMPORTED_HISTORY) as {
    url: unknown;
    title: unknown;
    visit_count: unknown;
    visited_at: number;
  }[];
  return keepRows(
    rows.map((row) =>
      historyRow(row.url, row.title, row.visit_count, Number(row.visited_at)),
    ),
  );
}

/* Firefox. */

interface FirefoxBookmarkRow {
  id: number;
  type: number;
  parent: number;
  title: string | null;
  guid: string | null;
  url: string | null;
}

const FIREFOX_ROOTS: Record<string, string> = {
  menu________: 'Bookmarks Menu',
  toolbar_____: 'Bookmarks Toolbar',
  unfiled_____: 'Other Bookmarks',
  mobile______: 'Mobile Bookmarks',
};

export function readFirefoxBookmarks(db: DatabaseSync): BookmarkNode[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.type, b.parent, b.title, b.guid, p.url
       FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk
       ORDER BY b.parent, b.position`,
    )
    .all() as unknown as FirefoxBookmarkRow[];
  const byParent = new Map<number, FirefoxBookmarkRow[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.parent) ?? [];
    siblings.push(row);
    byParent.set(row.parent, siblings);
  }
  const visited = new Set<number>();
  const childrenOf = (parent: number): BookmarkNode[] => {
    if (visited.has(parent)) return [];
    visited.add(parent);
    return (byParent.get(parent) ?? []).flatMap((row): BookmarkNode[] => {
      if (row.type === 1 && row.url) {
        return [{ type: 'link', title: row.title ?? '', url: row.url }];
      }
      if (row.type === 2) {
        return [
          {
            type: 'folder',
            name: row.title ?? '',
            children: childrenOf(row.id),
          },
        ];
      }
      return [];
    });
  };
  // Tags live under the root too, but they're not bookmarks.
  return rows
    .filter((row) => row.guid && FIREFOX_ROOTS[row.guid])
    .map((row) => ({
      type: 'folder' as const,
      name: FIREFOX_ROOTS[row.guid!]!,
      children: childrenOf(row.id),
    }));
}

export function readFirefoxHistory(db: DatabaseSync): HistoryRow[] {
  const rows = db
    .prepare(
      `SELECT url, title, visit_count, last_visit_date FROM moz_places
       WHERE hidden = 0 AND visit_count > 0 AND last_visit_date IS NOT NULL
       ORDER BY last_visit_date DESC LIMIT ?`,
    )
    .all(MAX_IMPORTED_HISTORY) as {
    url: unknown;
    title: unknown;
    visit_count: unknown;
    last_visit_date: number;
  }[];
  return keepRows(
    rows.map((row) =>
      historyRow(
        row.url,
        row.title,
        row.visit_count,
        Number(row.last_visit_date) / 1000,
      ),
    ),
  );
}

/* Safari. */

function isDictionary(
  value: PlistValue | undefined,
): value is { [key: string]: PlistValue } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

function safariNodes(value: PlistValue | undefined): BookmarkNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): BookmarkNode[] => {
    if (!isDictionary(item)) return [];
    if (item.WebBookmarkType === 'WebBookmarkTypeLeaf') {
      const uri = item.URIDictionary;
      const title = isDictionary(uri) ? uri.title : undefined;
      return typeof item.URLString === 'string'
        ? [
            {
              type: 'link',
              title: typeof title === 'string' ? title : '',
              url: item.URLString,
            },
          ]
        : [];
    }
    if (item.WebBookmarkType === 'WebBookmarkTypeList') {
      const name = typeof item.Title === 'string' ? item.Title : '';
      return [
        {
          type: 'folder',
          name:
            name === 'com.apple.ReadingList'
              ? 'Reading List'
              : name === 'BookmarksBar'
                ? 'Favorites'
                : name === 'BookmarksMenu'
                  ? 'Bookmarks Menu'
                  : name,
          children: safariNodes(item.Children),
        },
      ];
    }
    // History and other "proxy" entries aren't bookmarks.
    return [];
  });
}

export function parseSafariBookmarks(plist: PlistValue): BookmarkNode[] {
  return isDictionary(plist) ? safariNodes(plist.Children) : [];
}

export function readSafariHistory(db: DatabaseSync): HistoryRow[] {
  const rows = db
    .prepare(
      `SELECT i.url, i.visit_count, v.title, v.visit_time
       FROM history_items i
       JOIN history_visits v ON v.id = (
         SELECT id FROM history_visits WHERE history_item = i.id
         ORDER BY visit_time DESC LIMIT 1
       )
       ORDER BY v.visit_time DESC LIMIT ?`,
    )
    .all(MAX_IMPORTED_HISTORY) as {
    url: unknown;
    title: unknown;
    visit_count: unknown;
    visit_time: number;
  }[];
  return keepRows(
    rows.map((row) =>
      historyRow(
        row.url,
        row.title,
        row.visit_count,
        appleTimeToMs(Number(row.visit_time)),
      ),
    ),
  );
}

/** `History.json` from Safari's File › Export Browsing Data. */
export function parseSafariHistoryExport(json: string): HistoryRow[] {
  const parsed = JSON.parse(json) as { history?: unknown };
  if (!Array.isArray(parsed.history)) {
    throw new Error('Not a Safari history file');
  }
  return keepRows(
    (parsed.history as Record<string, unknown>[])
      .slice(0, MAX_IMPORTED_HISTORY)
      .map((entry) =>
        historyRow(
          entry.url,
          entry.title,
          entry.visit_count,
          Number(entry.time_usec) / 1000,
        ),
      ),
  );
}
