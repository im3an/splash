import type { BookmarkLink } from '../../shared/bookmarks';
import type { HistoryMatch } from '../storage/trail-store';
import { addressKey, bareUrl, frecency, parts } from './history-ranking';
import { matchScore } from './palette';

/**
 * Saving an address says as much as visiting it twice lately. A saved address
 * then beats a site opened once, but not a site used every day.
 */
const SAVED_FRECENCY = 200;

export interface RankedBookmark extends BookmarkLink {
  /** How well it matches, on the scale open pages and commands score on. */
  match: number;
  /** How good a result it is, on the scale history ranks on. */
  score: number;
}

/** The query's words as an address is stored: no scheme and no "www.". */
function addressWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^(https?:\/\/)?(www\.)?/, ''))
    .filter(Boolean);
}

/**
 * Bookmarks whose title and address hold every word of `query`, best first.
 * An address saved in two folders is one result: its best match, then the
 * first folder. Visits count, so a bookmark in daily use ranks like one.
 */
export function rankBookmarks(
  query: string,
  bookmarks: readonly BookmarkLink[],
  history: readonly HistoryMatch[],
  now: number,
): RankedBookmark[] {
  const words = addressWords(query);
  if (words.length === 0) return [];
  const used = new Map<string, number>();
  for (const entry of history) {
    const key = addressKey(entry.url);
    used.set(key, Math.max(used.get(key) ?? 0, frecency(entry, now)));
  }
  const best = new Map<string, RankedBookmark>();
  for (const bookmark of bookmarks) {
    const { title, url } = bookmark.link;
    const split = parts(url);
    if (!split) continue;
    const bare = bareUrl(url);
    const match = matchScore(
      [
        [title, 2],
        [bare, 1],
      ],
      words,
    );
    if (match === 0) continue;
    const key = addressKey(url);
    const weight = Math.log1p(Math.max(SAVED_FRECENCY, used.get(key) ?? 0));
    const score =
      weight *
      matchScore(
        [
          [split.host, 3],
          [title, 2],
          [split.rest, 1],
          // "github.com/foo" spans the host and the rest.
          [bare, 1],
        ],
        words,
      );
    const seen = best.get(key);
    if (!seen || seen.score < score) {
      best.set(key, { ...bookmark, match, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
