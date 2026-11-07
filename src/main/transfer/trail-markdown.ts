import { isNavigableUrl } from '../browser/url';
import type { StoredPage } from '../storage/trail-store';

/** What a trail's Markdown needs from a page. */
export type TrailPage = Pick<
  StoredPage,
  'id' | 'parentId' | 'url' | 'title' | 'customTitle' | 'note' | 'emoji'
>;

const escapeLabel = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]])/g, '\\$1');

/** Parentheses and spaces would end a Markdown link's address early. */
const escapeAddress = (url: string) =>
  url.replace(
    /[()\s]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

function line(page: TrailPage, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const label =
    escapeLabel(page.customTitle || page.title || page.url || '') || 'New page';
  // A trail's emoji sits before its name, where importing finds it again.
  const mark = page.emoji && page.parentId === null ? `${page.emoji} ` : '';
  const lines = [
    page.url
      ? `${indent}- ${mark}[${label}](${escapeAddress(page.url)})`
      : `${indent}- ${mark}${label}`,
  ];
  const note = page.note?.trim();
  if (note) {
    for (const noteLine of note.split('\n')) {
      lines.push(`${indent}  > ${noteLine}`);
    }
  }
  return lines;
}

/**
 * A trail as an outline: pages in order, nested as they are, links clickable,
 * each note under its page. `pages` is in depth-first order.
 */
export function trailToMarkdown(
  title: string,
  pages: readonly TrailPage[],
): string {
  const depths = new Map<string, number>();
  const body = pages.flatMap((page) => {
    const depth = page.parentId ? (depths.get(page.parentId) ?? -1) + 1 : 0;
    depths.set(page.id, depth);
    return line(page, depth);
  });
  return [`# ${title}`, '', ...body, ''].join('\n');
}

/** A page and everything beneath it, in depth-first order. */
export function branchOf(
  pages: readonly TrailPage[],
  rootId: string,
): TrailPage[] {
  const inBranch = new Set([rootId]);
  return pages.filter((page) => {
    if (page.id === rootId) return true;
    if (page.parentId && inBranch.has(page.parentId)) {
      inBranch.add(page.id);
      return true;
    }
    return false;
  });
}

/** A group's top-level pages and everything beneath them, in order. */
export function groupPages<
  Page extends TrailPage & { groupId?: string | null },
>(pages: readonly Page[], groupId: string): Page[] {
  const inGroup = new Set<string>();
  return pages.filter((page) => {
    const belongs = page.parentId
      ? inGroup.has(page.parentId)
      : page.groupId === groupId;
    if (belongs) inGroup.add(page.id);
    return belongs;
  });
}

/** A name a file can have, for `title`. */
export function trailFileName(title: string): string {
  const safe = title
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim();
  return `${safe || 'Trail'}.md`;
}

/** One line of an outline, with what was nested under it. */
export interface OutlineItem {
  label: string;
  url: string | null;
  note: string | null;
  /** Only on top-level items: a trail's mark. */
  emoji: string | null;
  children: OutlineItem[];
}

export interface TrailOutline {
  /** The heading above the list, if it had one. */
  title: string | null;
  items: OutlineItem[];
  pageCount: number;
  /** Links kept as plain names, since they weren't web addresses. */
  skippedAddresses: number;
}

const MAX_LABEL = 300;
const MAX_NOTE = 4000;
const LIST_ITEM =
  /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const NOTE = /^[ \t]*>[ \t]?(.*)$/;
const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)[ \t]+(?=\S)/u;
const BARE_ADDRESS = /^<?([a-z][a-z0-9+.-]*:\/\/[^\s>]+)>?(?:[ \t]+(.*))?$/i;

interface LineContent {
  label: string;
  address: string | null;
  /** Text after a link, which reads as a note about it. */
  rest: string;
}

/** `[label](address "title") rest`, keeping parentheses inside the address. */
function parseLink(text: string): LineContent | null {
  if (!text.startsWith('[')) return null;
  let end = 1;
  while (end < text.length && text[end] !== ']') {
    end += text[end] === '\\' ? 2 : 1;
  }
  if (text[end] !== ']' || text[end + 1] !== '(') return null;
  let depth = 1;
  let close = end + 2;
  while (close < text.length && depth > 0) {
    if (text[close] === '(') depth++;
    else if (text[close] === ')') depth--;
    close++;
  }
  if (depth !== 0) return null;
  const target = text.slice(end + 2, close - 1).trim();
  const address = /^<([^>]*)>/.exec(target)?.[1] ?? target.split(/\s/, 1)[0];
  return {
    label: text
      .slice(1, end)
      .replace(/\\([\\[\]])/g, '$1')
      .trim(),
    address: address ?? '',
    rest: text.slice(close).replace(/^[\s:–—-]+/, ''),
  };
}

function parseContent(text: string): LineContent {
  const link = parseLink(text);
  if (link) return link;
  const bare = BARE_ADDRESS.exec(text);
  if (bare) return { label: '', address: bare[1]!, rest: bare[2] ?? '' };
  return {
    label: text.replace(/\\([\\[\]])/g, '$1').trim(),
    address: null,
    rest: '',
  };
}

/**
 * Reads a Markdown outline: nested lists of links, notes as quotes under their
 * page, a first `#` heading as its title and later headings as parents. It
 * reads what `trailToMarkdown` writes, and what people write by hand. Only web
 * addresses come through as links, since the text may come from anywhere.
 */
export function parseTrailOutline(text: string): TrailOutline {
  const outline: TrailOutline = {
    title: null,
    items: [],
    pageCount: 0,
    skippedAddresses: 0,
  };
  // The way down to the last line. A heading stays open for anything below it.
  const open: { indent: number; level?: number; item: OutlineItem }[] = [];
  let last: OutlineItem | null = null;

  const add = (
    raw: string,
    parent: OutlineItem | null,
    fromLinkOnly = false,
  ): OutlineItem | null => {
    const mark = parent ? null : LEADING_EMOJI.exec(raw);
    const content = parseContent(mark ? raw.slice(mark[0].length) : raw);
    // Prose between lists isn't part of the outline.
    if (fromLinkOnly && content.address === null) return null;
    const allowed = content.address !== null && isNavigableUrl(content.address);
    if (content.address !== null && !allowed) outline.skippedAddresses++;
    const label = content.label.slice(0, MAX_LABEL);
    if (!label && !allowed) return null;
    const item: OutlineItem = {
      label,
      url: allowed ? content.address : null,
      note: content.rest ? content.rest.slice(0, MAX_NOTE) : null,
      emoji: mark ? mark[1]! : null,
      children: [],
    };
    (parent ? parent.children : outline.items).push(item);
    outline.pageCount++;
    return item;
  };

  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      if (level === 1 && outline.title === null && !outline.items.length) {
        outline.title = heading[2]!.slice(0, MAX_LABEL) || null;
        continue;
      }
      while (open.length && (open.at(-1)!.level ?? Infinity) >= level) {
        open.pop();
      }
      const item = add(heading[2]!, open.at(-1)?.item ?? null);
      if (item) {
        open.push({ indent: -1, level, item });
        last = item;
      }
      continue;
    }
    const quote = NOTE.exec(line);
    if (quote) {
      if (last) {
        const note = last.note ? `${last.note}\n${quote[1]!}` : quote[1]!;
        last.note = note.slice(0, MAX_NOTE);
      }
      continue;
    }
    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      const indent = listItem[1]!.replace(/\t/g, '    ').length;
      while (open.length && open.at(-1)!.indent >= indent) open.pop();
      const item = add(listItem[2]!, open.at(-1)?.item ?? null);
      if (item) {
        open.push({ indent, item });
        last = item;
      }
      continue;
    }
    // A line outside any list ends the list above it.
    while (open.length && open.at(-1)!.level === undefined) open.pop();
    const item = add(line.trim(), open.at(-1)?.item ?? null, true);
    if (item) last = item;
  }
  return outline;
}
