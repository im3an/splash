import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { useEffect, useState } from 'react';
import { api } from '../../../splash-api';
import { SiteIcon } from '../../Favicon';
import { openLink } from './open-link';

/**
 * A web page shown as a card. In Markdown it's just the address on a line of
 * its own, so notes stay plain text and still tie themselves to the site.
 */
export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { href: { default: '' } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-bookmark]',
        getAttrs: (element) => ({ href: element.getAttribute('data-href') }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({
        'data-bookmark': '',
        'data-href': HTMLAttributes.href,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView);
  },

  markdownTokenizer: {
    name: 'bookmark',
    level: 'block',
    // Only where a block can begin: the start, or after a blank line.
    start: (src: string) => {
      const match = /(?:^|\n[ \t]*\n)(https?:\/\/)/.exec(src);
      return match ? match.index + match[0].length - match[1]!.length : -1;
    },
    tokenize: (src: string) => {
      const match =
        /^(https?:\/\/[^\s<>]+)[ \t]*(?:\n(?=[ \t]*(?:\n|$))|\n?$)/.exec(src);
      if (!match) return undefined;
      return { type: 'bookmark', raw: match[0], href: match[1] };
    },
  },
  parseMarkdown: (token) => ({
    type: 'bookmark',
    attrs: { href: (token as { href?: string }).href ?? '' },
  }),
  renderMarkdown: (node) => String(node.attrs?.href ?? ''),
});

function BookmarkView({ node, selected }: ReactNodeViewProps) {
  const href = String(node.attrs.href ?? '');
  const [title, setTitle] = useState<string | null>(null);
  let host = href;
  let path = '';
  try {
    const url = new URL(href);
    host = url.hostname.replace(/^www\./, '');
    path = decodeURI(
      `${url.pathname === '/' ? '' : url.pathname}${url.search}`,
    );
  } catch {
    // Shown as written.
  }
  // The title you saw when you visited, if you did: no request to the site.
  useEffect(() => {
    let current = true;
    void api()
      .listHistory(href, 8)
      .then((entries) => {
        const match = entries.find((entry) => entry.url === href);
        if (current && match?.title) setTitle(match.title);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [href]);
  return (
    <NodeViewWrapper className="note-bookmark" data-selected={selected}>
      <a
        href={href}
        contentEditable={false}
        draggable={false}
        onClick={(event) => {
          event.preventDefault();
          openLink(href);
        }}
      >
        <span className="note-bookmark-icon">
          <SiteIcon url={null} site={href} />
        </span>
        <span className="note-bookmark-text">
          <span className="note-bookmark-title">{title ?? host}</span>
          <span className="note-bookmark-url">
            {title ? host : ''}
            {path && <span>{path}</span>}
          </span>
        </span>
        <span className="note-bookmark-go" aria-hidden>
          ↗
        </span>
      </a>
    </NodeViewWrapper>
  );
}
