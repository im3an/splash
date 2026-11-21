import { Node, createBlockMarkdownSpec, mergeAttributes } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';

export const CALLOUT_ICONS = [
  '💡',
  '📌',
  '⚠️',
  '✅',
  '❗',
  '🔥',
  '🧠',
  '📎',
  '🗓️',
  '💬',
];

/** A tinted box with an icon, written as `:::callout {emoji="💡"}` … `:::`. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return { emoji: { default: '💡' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
  ...createBlockMarkdownSpec({
    nodeName: 'callout',
    defaultAttributes: { emoji: '💡' },
    allowedAttributes: ['emoji'],
  }),
});

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const [picking, setPicking] = useState(false);
  return (
    <NodeViewWrapper className="note-callout">
      <span className="note-callout-icon" contentEditable={false}>
        <button
          type="button"
          aria-label="Change icon"
          onClick={() => setPicking((open) => !open)}
        >
          {String(node.attrs.emoji)}
        </button>
        {picking && (
          <span className="note-pop note-callout-pick" role="menu">
            {CALLOUT_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  updateAttributes({ emoji });
                  setPicking(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </span>
        )}
      </span>
      <NodeViewContent className="note-callout-body" />
    </NodeViewWrapper>
  );
}
