import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as PmNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

  // Measured after render, so the menu stays on screen however long it is.
  const [place, setPlace] = useState({ left: at.x, top: at.y, ready: false });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const margin = 12;
    const { width, height } = menu.getBoundingClientRect();
    const below = window.innerHeight - at.y - margin;
    const top =
      height <= below
        ? at.y
        : Math.max(margin, window.innerHeight - margin - height);
    const left = Math.min(at.x, window.innerWidth - margin - width);
    setPlace({ left, top, ready: true });
  }, [at.x, at.y]);

  const kind = kindOf(node);
  const item = (
    key: string,
    Icon: typeof Copy,
    label: string,
    run: () => void,
    extra?: { danger?: boolean; keys?: string; checked?: boolean },
  ) => (
    <button
      key={key}
      type="button"
      role={extra?.checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={extra?.checked}
      className={`note-menu-item${extra?.danger ? ' note-menu-danger' : ''}`}
      onClick={act(run)}
    >
      <Icon size={15} aria-hidden />
      <span className="note-menu-text">{label}</span>
      {extra?.keys && <kbd className="note-menu-keys">{extra.keys}</kbd>}
      {extra?.checked && <Check size={14} aria-hidden />}
    </button>
  );

  return (
    <div
      ref={ref}
      className="note-pop note-menu note-block-menu"
      role="menu"
      style={{
        left: place.left,
        top: place.top,
        visibility: place.ready ? 'visible' : 'hidden',
      }}
    >
      {item('duplicate', Copy, 'Duplicate', () =>
        editor
          .chain()
          .insertContentAt(pos + node.nodeSize, node.toJSON())
          .focus()
          .run(),
      )}
      {item('up', ArrowUp, 'Move up', () => move(-1), { keys: '⌥⇧↑' })}
      {item('down', ArrowDown, 'Move down', () => move(1), { keys: '⌥⇧↓' })}
      {item(
        'delete',
        Trash2,
        'Delete',
        () =>
          editor
            .chain()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .focus()
            .run(),
        { danger: true },
      )}
      {textual && (
        <>
          <span className="note-menu-rule" />
          <span className="note-menu-label">Turn into</span>
          {TURN_INTO.map((command) =>
            item(
              command.id,
              command.icon,
              command.title,
              () => {
                const inner = node.isTextblock ? pos + 1 : pos + 2;
                editor.view.dispatch(
                  editor.state.tr.setSelection(
                    TextSelection.create(editor.state.doc, inner),
                  ),
                );
                command.run(editor);
              },
              { checked: command.id === kind },
            ),
          )}
        </>
      )}
    </div>
  );
}

/** The block menu's name for a node, matching the slash command ids. */
function kindOf(node: PmNode): string {
  switch (node.type.name) {
    case 'heading':
      return `h${node.attrs.level as number}`;
    case 'paragraph':
      return 'text';
    case 'blockquote':
      return 'quote';
    case 'bulletList':
      return 'bullets';
    case 'orderedList':
      return 'numbers';
    case 'taskList':
      return 'todo';
    case 'codeBlock':
      return 'code';
    default:
      return node.type.name;
  }
}
