import { Node, createBlockMarkdownSpec, mergeAttributes } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { ChevronRight } from '../../../icons';

/**
 * A block that folds its contents under a one-line title, written as
 * `:::toggle {title="…"}` … `:::`. Open or closed is remembered too.
 */
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: '' },
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-open') !== 'false',
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-toggle]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
  ...createBlockMarkdownSpec({
    nodeName: 'toggle',
    defaultAttributes: { title: '', open: true },
    allowedAttributes: ['title', 'open'],
    parseAttributes: (text) => {
      const title = /title="((?:[^"\\]|\\.)*)"/.exec(text)?.[1] ?? '';
      const open = /open="?false"?/.test(text) ? false : true;
      return { title: title.replace(/\\"/g, '"'), open };
    },
    serializeAttributes: (attrs) =>
      `title="${String(attrs.title ?? '').replace(/"/g, '\\"')}"${attrs.open === false ? ' open="false"' : ''}`,
  }),
});

function ToggleView({
  node,
  updateAttributes,
  editor,
  getPos,
}: ReactNodeViewProps) {
  const open = node.attrs.open !== false;
  return (
    <NodeViewWrapper className="note-toggle" data-open={open}>
      <div className="note-toggle-head" contentEditable={false}>
        <button
          type="button"
          className="note-toggle-arrow"
          aria-label={open ? 'Fold' : 'Unfold'}
          aria-expanded={open}
          onClick={() => updateAttributes({ open: !open })}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <input
          className="note-toggle-title"
          value={String(node.attrs.title ?? '')}
          placeholder="Toggle"
          aria-label="Toggle title"
          onChange={(event) => updateAttributes({ title: event.target.value })}
          onKeyDown={(event) => {
            // Enter or ↓ goes into the folded contents.
            if (event.key === 'Enter' || event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) updateAttributes({ open: true });
              const pos = typeof getPos === 'function' ? getPos() : undefined;
              if (pos !== undefined)
                editor
                  .chain()
                  .focus(pos + 2)
                  .run();
            }
          }}
        />
      </div>
      <NodeViewContent className="note-toggle-body" hidden={!open} />
    </NodeViewWrapper>
  );
}
