import type { StoredPage } from '../storage/trail-store';

/** What a trail's Markdown needs from a page. */
export type TrailPage = Pick<
  StoredPage,
  'id' | 'parentId' | 'url' | 'title' | 'customTitle' | 'note'
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
  const lines = [
    page.url
      ? `${indent}- [${label}](${escapeAddress(page.url)})`
      : `${indent}- ${label}`,
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
