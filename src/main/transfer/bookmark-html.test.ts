import { describe, expect, it } from 'vitest';
import { bookmarksToHtml, parseBookmarkHtml } from './bookmark-html';
import type { BookmarkNode } from './bookmark-tree';

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://a.example/?x=1&amp;y=2" ADD_DATE="1" ICON="data:image/png;base64,AAAA">A &amp; B</A>
        <DT><H3>Nested</H3>
        <DL><p>
            <DT><A HREF='https://b.example/'>B <b>bold</b></A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://c.example/">C</A>
</DL><p>
`;

describe('parseBookmarkHtml', () => {
  it('keeps folders, nesting, titles and decoded addresses', () => {
    expect(parseBookmarkHtml(CHROME_EXPORT)).toEqual([
      {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          { type: 'link', title: 'A & B', url: 'https://a.example/?x=1&y=2' },
          {
            type: 'folder',
            name: 'Nested',
            children: [
              { type: 'link', title: 'B bold', url: 'https://b.example/' },
            ],
          },
        ],
      },
      { type: 'link', title: 'C', url: 'https://c.example/' },
    ]);
  });

  it('survives a file that never closes its lists', () => {
    const nodes = parseBookmarkHtml(
      '<DL><DT><H3>F</H3><DL><DT><A HREF="https://x.example/">X</A>',
    );
    expect(nodes).toEqual([
      {
        type: 'folder',
        name: 'F',
        children: [{ type: 'link', title: 'X', url: 'https://x.example/' }],
      },
    ]);
  });

  it('finds nothing in a file that has no bookmarks', () => {
    expect(parseBookmarkHtml('<html><body>hello</body></html>')).toEqual([]);
  });
});

describe('bookmarksToHtml', () => {
  it('reads back what it wrote, including characters that need escaping', () => {
    const nodes: BookmarkNode[] = [
      {
        type: 'folder',
        name: 'R&D <"quotes">',
        children: [
          {
            type: 'link',
            title: 'T<i>x</i> & "y"',
            url: 'https://a.example/?a=1&b="2"',
          },
        ],
      },
    ];
    expect(parseBookmarkHtml(bookmarksToHtml(nodes))).toEqual(nodes);
  });

  it('cannot be made to inject markup', () => {
    const html = bookmarksToHtml([
      {
        type: 'link',
        title: '</A><script>alert(1)</script>',
        url: 'https://a.example/"><script>',
      },
    ]);
    expect(html).not.toContain('<script>');
  });
});
