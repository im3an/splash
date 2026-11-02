import type { HistoryMatch } from '../storage/trail-store';
import { matchScore } from './palette';

const DAY = 86_400_000;

/**
 * How much a past visit should count now: recent visits weigh most, and
 * repeat visits add up slowly, so a site used daily beats one opened once.
 */
export function frecency(entry: HistoryMatch, now: number): number {
  const days = Math.max(0, now - entry.lastVisitedAt) / DAY;
  const recency =
    days <= 4 ? 100 : days <= 14 ? 70 : days <= 31 ? 50 : days <= 90 ? 30 : 10;
  return recency * (1 + Math.log2(Math.max(1, entry.visitCount)));
}

/** The address as people type it: no scheme, no "www.", no lone "/". */
export function bareUrl(url: string, keepWww = false): string {
  const bare = url.replace(/^https?:\/\//i, '');
  const host = keepWww ? bare : bare.replace(/^www\./i, '');
  return host.replace(/^([^/?#]+)\/$/, '$1');
}

function parts(url: string): { host: string; rest: string } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host.replace(/^www\./, ''),
      rest: parsed.pathname + parsed.search,
    };
  } catch {
    return null;
  }
}

/**
 * Edit distance where swapping two neighbouring letters counts as one
 * edit, the commonest typo ("gihtub").
 */
export function editDistance(a: string, b: string): number {
  const width = b.length + 1;
  const cells = Array.from({ length: (a.length + 1) * width }, () => 0);
  const at = (i: number, j: number) => cells[i * width + j] ?? 0;
  for (let i = 0; i <= a.length; i++) cells[i * width] = i;
  for (let j = 0; j <= b.length; j++) cells[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      cells[i * width + j] = best;
    }
  }
  return at(a.length, b.length);
}

/**
 * How close a misspelt word is to the start of one of the site's names
 * ("githb" to github.com), or 0 when it isn't close. Only words long enough
 * to mean something are tried, and the first letter must match.
 */
function closeness(word: string, host: string): number {
  if (word.length < 4 || /[./:]/.test(word)) return 0;
  const allowed = word.length <= 5 ? 1 : 2;
  const labels = host.split('.').slice(0, -1);
  let best = 0;
  for (const label of labels) {
    if (label[0] !== word[0] || label.length < 3) continue;
    const distance = editDistance(word, label.slice(0, word.length));
    if (distance > 0 && distance <= allowed) {
      best = Math.max(best, allowed + 1 - distance);
    }
  }
  return best;
}

export interface RankedHistory {
  entry: HistoryMatch;
  score: number;
  /** Matched only as a likely misspelling of the site's name. */
  fuzzy: boolean;
}

/**
 * Past visits that match `query`, best first. A match in the site's name
 * beats one in the title or path, and among similar matches the visit used
 * more, and more recently, wins. With no direct match, a site whose name is
 * one or two typos away still shows, below every real match.
 */
export function rankHistory(
  query: string,
  entries: readonly HistoryMatch[],
  now: number,
): RankedHistory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const best = new Map<string, RankedHistory>();
  for (const entry of entries) {
    const split = parts(entry.url);
    if (!split) continue;
    const weight = Math.log1p(frecency(entry, now));
    const match = matchScore(
      [
        [split.host, 3],
        [entry.title, 2],
        [split.rest, 1],
      ],
      words,
    );
    let ranked: RankedHistory | null = null;
    if (match > 0) {
      ranked = { entry, score: match * weight, fuzzy: false };
    } else if (words.length === 1 && words[0]) {
      const close = closeness(words[0], split.host);
      if (close > 0)
        ranked = { entry, score: close * weight * 0.25, fuzzy: true };
    }
    if (!ranked) continue;
    // The same page over http and https, or with and without "www.", is
    // one result.
    const key = bareUrl(entry.url).toLowerCase();
    const seen = best.get(key);
    if (!seen || seen.score < ranked.score) best.set(key, ranked);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export interface InlineCompletion {
  /** What the field should hold: the typed text plus the completed rest. */
  text: string;
  /** Where Enter goes while the completion stands. */
  url: string;
  title: string;
}

/**
 * Completes what's being typed into an address the user has been to, the
 * way the field fills in "github.com" after "gi". Without a "/" it
 * completes a site, the one visited most; with one, a whole address. Typing
 * a scheme or "www." keeps it in the completion. Words with spaces are
 * searches and never complete.
 */
export function inlineCompletion(
  typed: string,
  entries: readonly HistoryMatch[],
  now: number,
): InlineCompletion | null {
  if (!typed || /\s/.test(typed)) return null;
  const lower = typed.toLowerCase();
  const withScheme = /^https?:\/\//.test(lower);
  const keepWww = /^(https?:\/\/)?www\./.test(lower);
  const form = (url: string) => (withScheme ? url : bareUrl(url, keepWww));
  const wholeAddress = withScheme
    ? lower.replace(/^https?:\/\//, '').includes('/')
    : lower.includes('/');

  if (!wholeAddress) {
    // Sites by everything visited on them.
    const sites = new Map<
      string,
      { site: string; total: number; best: HistoryMatch; bestScore: number }
    >();
    for (const entry of entries) {
      const shown = form(entry.url);
      const site = withScheme
        ? shown.replace(/^(https?:\/\/[^/?#]+).*$/i, '$1')
        : shown.replace(/[/?#].*$/, '');
      if (!site.toLowerCase().startsWith(lower)) continue;
      const score = frecency(entry, now);
      const key = site.toLowerCase();
      const known = sites.get(key);
      if (!known) {
        sites.set(key, { site, total: score, best: entry, bestScore: score });
      } else {
        known.total += score;
        if (score > known.bestScore) {
          known.best = entry;
          known.bestScore = score;
        }
      }
    }
    const top = [...sites.values()].sort((a, b) => b.total - a.total)[0];
    if (!top) return null;
    const origin = new URL(top.best.url).origin;
    const rootTitle = entries.find(
      (entry) => entry.url === `${origin}/` && entry.title,
    )?.title;
    return {
      text: typed + top.site.slice(typed.length),
      url: `${origin}/`,
      title: rootTitle ?? new URL(origin).host.replace(/^www\./, ''),
    };
  }

  let top: { entry: HistoryMatch; shown: string; score: number } | null = null;
  for (const entry of entries) {
    const shown = form(entry.url);
    if (!shown.toLowerCase().startsWith(lower)) continue;
    const score = frecency(entry, now);
    if (!top || score > top.score) top = { entry, shown, score };
  }
  if (!top) return null;
  return {
    text: typed + top.shown.slice(typed.length),
    url: top.entry.url,
    title: top.entry.title || bareUrl(top.entry.url),
  };
}

/**
 * History worth suggesting for `query`: ranked, without pages that are
 * already open (or that a completion already leads to), and with rows that
 * would read the same, like two "YouTube" pages on one site, as one.
 */
export function suggestedHistory(
  query: string,
  entries: readonly HistoryMatch[],
  now: number,
  hidden: Iterable<string | null | undefined> = [],
): RankedHistory[] {
  const skip = new Set<string>();
  for (const url of hidden) if (url) skip.add(bareUrl(url).toLowerCase());
  const looks = new Set<string>();
  return rankHistory(query, entries, now).filter(({ entry }) => {
    if (skip.has(bareUrl(entry.url).toLowerCase())) return false;
    const host = parts(entry.url)?.host ?? '';
    const look = `${entry.title.trim().toLowerCase()}\n${host}`;
    if (looks.has(look)) return false;
    looks.add(look);
    return true;
  });
}
