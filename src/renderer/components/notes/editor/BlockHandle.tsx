import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as PmNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BLOCK_COMMANDS } from './commands';

const TURN_INTO = BLOCK_COMMANDS.filter((command) => command.turnInto);

/**
 * Beside the block under the pointer: + adds a block below and opens the
 * block menu; the grip drags the block, and a click on it opens its menu.
 */
export function BlockHandle({ editor }: { editor: Editor }) {
  const current = useRef<{ node: PmNode; pos: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const add = () => {
    const target = current.current;
    if (!target) return;
    const { node, pos } = target;
    const empty = node.type.name === 'paragraph' && node.content.size === 0;
    if (empty) {
      editor
        .chain()
        .focus(pos + 1)
        .insertContent('/')
        .run();
      return;
    }
    const after = pos + node.nodeSize;
    editor
      .chain()
      .insertContentAt(after, { type: 'paragraph' })
      .focus(after + 1)
      .insertContent('/')
      .run();
  };

  return (
    <>
      <DragHandle
        editor={editor}
        className="note-handle"
        nested
        onNodeChange={({ node, pos }) => {
          current.current = node ? { node, pos } : null;
        }}
      >
        <button
          type="button"
          className="note-handle-button"
          aria-label="Add a block below"
          title="Add a block below"
          onClick={add}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="note-handle-button note-handle-grip"
          aria-label="Drag to move, click for options"
          title="Drag to move · Click for options"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <GripVertical size={16} />
        </button>
      </DragHandle>
      {menu && current.current && (
        <BlockMenu
          editor={editor}
          target={current.current}
          at={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function BlockMenu({
  editor,
  target,
  at,
  onClose,
}: {
  editor: Editor;
  target: { node: PmNode; pos: number };
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  const { node, pos } = target;
  const textual = node.isTextblock || node.firstChild?.isTextblock;

  const act = (run: () => void) => () => {
    run();
    onClose();
  };
  const move = (direction: -1 | 1) => {
    const { doc } = editor.state;
    const $pos = doc.resolve(pos);
    const index = $pos.index();
    const parent = $pos.parent;
    const neighbour = parent.maybeChild(index + direction);
    if (!neighbour) return;
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
    const insertAt =
      direction === -1 ? pos - neighbour.nodeSize : pos + neighbour.nodeSize;
    tr.insert(insertAt, node);
    tr.setSelection(NodeSelection.create(tr.doc, insertAt));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };

  return (
    <div
      ref={ref}
      className="note-pop note-menu note-block-menu"
      role="menu"
      style={{
        left: Math.min(at.x, window.innerWidth - 240),
        top: Math.min(at.y, window.innerHeight - 380),
      }}
    >
      {textual && (
        <>
          <span className="note-menu-label">Turn into</span>
          {TURN_INTO.map((command) => {
            const Icon = command.icon;
            return (
              <button
                key={command.id}
                type="button"
                role="menuitem"
                className="note-menu-item"
                onClick={act(() => {
                  const inner = node.isTextblock ? pos + 1 : pos + 2;
                  editor.view.dispatch(
                    editor.state.tr.setSelection(
                      TextSelection.create(editor.state.doc, inner),
                    ),
                  );
                  command.run(editor);
                })}
              >
                <Icon size={15} aria-hidden />
                {command.title}
              </button>
            );
          })}
          <span className="note-menu-rule" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className="note-menu-item"
        onClick={act(() =>
          editor
            .chain()
            .insertContentAt(pos + node.nodeSize, node.toJSON())
            .focus()
            .run(),
        )}
      >
        <Copy size={15} aria-hidden />
        Duplicate
      </button>
      <button
        type="button"
        role="menuitem"
        className="note-menu-item"
        onClick={act(() => move(-1))}
      >
        <ArrowUp size={15} aria-hidden />
        Move up
      </button>
      <button
        type="button"
        role="menuitem"
        className="note-menu-item"
        onClick={act(() => move(1))}
      >
        <ArrowDown size={15} aria-hidden />
        Move down
      </button>
      <span className="note-menu-rule" />
      <button
        type="button"
        role="menuitem"
        className="note-menu-item note-menu-danger"
        onClick={act(() =>
          editor
            .chain()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .focus()
            .run(),
        )}
      >
        <Trash2 size={15} aria-hidden />
        Delete
      </button>
    </div>
  );
}
