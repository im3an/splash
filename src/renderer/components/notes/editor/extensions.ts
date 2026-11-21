import { Extension, type Editor, type Extensions } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { TableKit } from '@tiptap/extension-table';
import Typography from '@tiptap/extension-typography';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { Bookmark } from './Bookmark';
import { Callout } from './Callout';
import { Contents } from './Contents';
import { Toggle } from './Toggle';
import { CodeBlock } from './CodeBlock';
import type { BlockCommand } from './commands';
import { SlashCommand } from './SlashMenu';
import { useNoteUi } from './ui-store';

/**
 * Splash's menus own ⌘K, ⌘⇧S and ⌘⇧H, so strike, highlight and link move to
 * keys the menus leave free.
 */
const NoteKeys = Extension.create({
  name: 'noteKeys',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
      'Mod-Shift-e': () => this.editor.commands.toggleHighlight(),
      'Mod-Shift-k': () => {
        if (this.editor.state.selection.empty) return false;
        useNoteUi.getState().set({ linkRequest: Date.now() });
        return true;
      },
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),
      // ⌘⇧↑/↓ belong to Splash's trail, so blocks move with ⌥⇧.
      'Alt-Shift-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-Shift-ArrowDown': () => moveBlock(this.editor, 1),
      // ⌘↵ ticks the to-do under the caret.
      'Mod-Enter': () => {
        if (!this.editor.isActive('taskItem')) return false;
        const checked = Boolean(this.editor.getAttributes('taskItem').checked);
        return this.editor.commands.updateAttributes('taskItem', {
          checked: !checked,
        });
      },
    };
  },
});

/** Named highlight colours, drawn from theme tokens; none is the plain ==mark==. */
export const HIGHLIGHTS = [
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;

const ColourHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute('data-color');
          return HIGHLIGHTS.includes(value as (typeof HIGHLIGHTS)[number])
            ? value
            : null;
        },
        // A name, never a raw colour: the theme decides how it looks.
        renderHTML: (attrs) =>
          attrs.color ? { 'data-color': attrs.color } : {},
      },
    };
  },
  renderMarkdown: (node, helpers) => {
    const inner = helpers.renderChildren(node);
    const colour = node.attrs?.color as string | null | undefined;
    return colour
      ? `<mark data-color="${colour}">${inner}</mark>`
      : `==${inner}==`;
  },
}).configure({ multicolor: true });

/** Moves the block holding the caret past its neighbour. */
function moveBlock(editor: Editor, direction: -1 | 1) {
  const { state } = editor;
  const { $from } = state.selection;
  if ($from.depth < 1) return false;
  const pos = $from.before(1);
  const node = state.doc.child($from.index(0));
  const neighbour = state.doc.maybeChild($from.index(0) + direction);
  if (!neighbour) return false;
  const offset = state.selection.from - pos;
  const tr = state.tr.delete(pos, pos + node.nodeSize);
  const at =
    direction === -1 ? pos - neighbour.nodeSize : pos + neighbour.nodeSize;
  tr.insert(at, node);
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.setTextSelection(at + offset);
  return true;
}

/** `$5 and $10` is money, not math: no space inside the dollars, no digit after. */
const StrictInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const match = /^\$(?![\s$])([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
      if (!match) return undefined;
      return {
        type: 'inlineMath',
        raw: match[0],
        latex: (match[1] ?? '').trim(),
      };
    },
  },
});

/** `$$` on lines of their own, as people write it, as well as `$$x$$`. */
const MultilineBlockMath = BlockMath.extend({
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: (src: string) => src.indexOf('$$'),
    tokenize: (src: string) => {
      const match = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
      if (!match) return undefined;
      return {
        type: 'blockMath',
        raw: match[0],
        latex: (match[1] ?? '').trim(),
      };
    },
  },
});

export function noteExtensions(options: {
  commands: () => BlockCommand[];
}): Extensions {
  const editMath =
    (inline: boolean) => (node: { attrs: { latex?: string } }, pos: number) =>
      useNoteUi
        .getState()
        .set({ math: { pos, latex: node.attrs.latex ?? '', inline } });
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noreferrer', target: null },
      },
      dropcursor: { color: 'var(--accent)', width: 2 },
    }),
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
    CodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    ColourHighlight,
    Typography,
    CharacterCount,
    MultilineBlockMath.configure({
      katexOptions: { throwOnError: false, displayMode: true },
      onClick: editMath(false),
    }),
    StrictInlineMath.configure({
      katexOptions: { throwOnError: false },
      onClick: editMath(true),
    }),
    Bookmark,
    Callout,
    Toggle,
    Contents,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node, editor, pos }) => {
        if (node.type.name === 'heading') {
          return pos === 0 && node.attrs.level === 1
            ? 'Untitled'
            : `Heading ${node.attrs.level}`;
        }
        if (node.type.name === 'paragraph') {
          return editor.state.doc.childCount <= 2 &&
            pos <= editor.state.doc.firstChild!.nodeSize
            ? "Start writing, or press '/' for blocks"
            : "Press '/' for blocks";
        }
        return '';
      },
    }),
    SlashCommand.configure({ commands: options.commands }),
    NoteKeys,
  ];
}
