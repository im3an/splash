import { Node, createAtomBlockMarkdownSpec } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react';

/** A live table of contents inside the note, written as `:::toc`. */
export const Contents = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'nav[data-toc]' }];
  },
  renderHTML() {
    return ['nav', { 'data-toc': '' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ContentsView);
  },
  ...createAtomBlockMarkdownSpec({ nodeName: 'toc' }),
});

function ContentsView({ editor, selected }: ReactNodeViewProps) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list: { level: number; text: string }[] = [];
      e.state.doc.descendants((node) => {
        if (node.type.name === 'heading' && node.textContent.trim())
          list.push({
            level: Number(node.attrs.level),
            text: node.textContent,
          });
        return !node.isTextblock;
      });
      return list;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const top = Math.min(...headings.map((heading) => heading.level), 6);
  return (
    <NodeViewWrapper className="note-contents" data-selected={selected}>
      <nav contentEditable={false} aria-label="Contents">
        {headings.length ? (
          headings.map((heading, index) => (
            <button
              key={index}
              type="button"
              style={{ paddingLeft: (heading.level - top) * 16 }}
              onClick={() =>
                editor.view.dom
                  .querySelectorAll('h1, h2, h3, h4')
                  [index]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
              }
            >
              {heading.text}
            </button>
          ))
        ) : (
          <p className="note-code-hint">Add headings and they list here.</p>
        )}
      </nav>
    </NodeViewWrapper>
  );
}
