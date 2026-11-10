/**
 * Notes: Markdown documents kept beside the trails, tied to the sites they
 * talk about. A note belongs to a site when you pinned it there, or when its
 * text links to it, so pasting a link is enough.
 */

export interface Note {
  id: string;
  body: string;
  /** Sites pinned by hand, as `siteKey` gives them. */
  sites: string[];
  createdAt: number;
  updatedAt: number;
}

export const MAX_NOTE_LENGTH = 200_000;
export const MAX_NOTE_SITES = 50;

/** One heading in a note's outline. */
export interface OutlineEntry {
  level: number;
  text: string;
  /** The heading's line in the note's text. */
  line: number;
  slug: string;
}

/** A site as notes group it: its host without a leading `www.`. */
export function siteKey(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    const { protocol, hostname } = new URL(address);
    if (protocol !== 'https:' && protocol !== 'http:') return null;
    return hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/** Strips the Markdown a heading may carry, for the outline and the title. */
export function plainHeading(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\$([^$]+)\$/g, '$1')
    .trim();
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  );
}

/** The note's headings in order, skipping anything inside code blocks. */
export function noteOutline(body: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const used = new Map<string, number>();
  let fenced = false;
  body.split('\n').forEach((raw, line) => {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const match = HEADING.exec(raw);
    if (!match) return;
    const text = plainHeading(match[2] ?? '');
    if (!text) return;
    const base = slugify(text);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    entries.push({
      level: (match[1] ?? '#').length,
      text,
      line,
      slug: count ? `${base}-${count}` : base,
    });
  });
  return entries;
}

/** The first heading, else the first line with words in it. */
export function noteTitle(body: string): string {
  const heading = noteOutline(body)[0];
  if (heading) return heading.text;
  const line = body
    .split('\n')
    .map((text) => plainHeading(text.replace(/^[>\-*+\d.\s]+/, '')))
    .find((text) => /[\p{L}\p{N}]/u.test(text));
  return line ? line.slice(0, 80) : 'Untitled';
}

/** Web links written in the note's text. */
export function noteLinks(body: string): string[] {
  const found = body.match(/https?:\/\/[^\s<>()[\]"'`]+/g) ?? [];
  return [...new Set(found.map((link) => link.replace(/[.,;:!?]+$/, '')))];
}

/** Every site the note belongs to: pinned, then linked. */
export function noteSites(note: Pick<Note, 'body' | 'sites'>): string[] {
  const linked = noteLinks(note.body)
    .map(siteKey)
    .filter((site): site is string => site !== null);
  return [...new Set([...note.sites, ...linked])];
}

/** Notes for a site, most recently changed first. */
export function notesForSite(notes: readonly Note[], site: string | null) {
  if (!site) return [];
  return notes
    .filter((note) => noteSites(note).includes(site))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
