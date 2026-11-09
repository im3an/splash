import type { BookmarkNode } from './bookmark-tree';

/*
 * The "Netscape bookmark file" every browser exports and imports. It's HTML of
 * a loose kind (unclosed <DT> and <p>), so it is read as a stream of tags
 * rather than a document.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
      const value =
        code[1]?.toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : whole;
    },
  );
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

const clean = (text: string) =>
  decodeEntities(text.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** Reads a bookmark file. Whatever isn't a link or a folder is ignored. */
export function parseBookmarkHtml(html: string): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: BookmarkNode[][] = [root];
  /** A heading waits for the list it titles. */
  let pendingFolder: Extract<BookmarkNode, { type: 'folder' }> | null = null;
  const tags = /<(a|h[1-6]|dl)\b([^>]*)>|<\/dl\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    const name = match[1]?.toLowerCase();
    const current = stack[stack.length - 1]!;
    if (!name) {
      if (stack.length > 1) stack.pop();
      pendingFolder = null;
    } else if (name === 'dl') {
      if (pendingFolder) {
        stack.push(pendingFolder.children);
        pendingFolder = null;
      }
      // Otherwise it's the file's outer list: its contents are the top level.
    } else {
      const close = new RegExp(`</${name}\\s*>`, 'i');
      const rest = html.slice(tags.lastIndex);
      const end = close.exec(rest);
      const text = clean(end ? rest.slice(0, end.index) : '');
      if (end) tags.lastIndex += end.index + end[0].length;
      if (name === 'a') {
        const href = attribute(`<a${match[2]}>`, 'href');
        if (href) current.push({ type: 'link', title: text, url: href });
      } else if (name === 'h1') {
        // The file's own title ("Bookmarks"), not a folder.
      } else {
        const folder: BookmarkNode = {
          type: 'folder',
          name: text,
          children: [],
        };
        current.push(folder);
        pendingFolder = folder;
      }
    }
  }
  return root;
}

function write(nodes: readonly BookmarkNode[], indent: string): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    if (node.type === 'link') {
      lines.push(
        `${indent}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title)}</A>`,
      );
    } else {
      lines.push(
        `${indent}<DT><H3>${escapeHtml(node.name)}</H3>`,
        `${indent}<DL><p>`,
        ...write(node.children, `${indent}    `),
        `${indent}</DL><p>`,
      );
    }
  }
  return lines;
}

/** Writes a file other browsers can import. */
export function bookmarksToHtml(nodes: readonly BookmarkNode[]): string {
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    ...write(nodes, '    '),
    '</DL><p>',
    '',
  ].join('\n');
}
