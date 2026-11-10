import type { Editor, Range } from '@tiptap/core';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Network,
  PenTool,
  Pilcrow,
  Quote,
  Sigma,
  SquareFunction,
  Table,
  MessageSquareQuote,
  ListTree,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useNoteUi } from './ui-store';

export interface BlockCommand {
  id: string;
  title: string;
  hint: string;
  group: 'Basic blocks' | 'Lists' | 'Media and embeds' | 'Advanced';
  icon: LucideIcon;
  keywords: string;
  /** What to type for it as Markdown, shown in the menu. */
  markdown?: string;
  /** Turns the current block into this one; the slash text is gone already. */
  run(editor: Editor): void;
  /** Whether it can replace an existing block (the Turn into menu). */
  turnInto?: boolean;
  isActive?(editor: Editor): boolean;
}

const chain = (editor: Editor) => editor.chain().focus();

export function pageBookmarkCommand(
  site: { url: string; title: string } | null,
): BlockCommand[] {
  if (!site) return [];
  return [
    {
      id: 'page',
      title: 'Link to this page',
      hint: site.title,
      group: 'Media and embeds',
      icon: Link2,
      keywords: 'bookmark embed current page site web link card',
      run: (editor) =>
        chain(editor)
          .insertContent({ type: 'bookmark', attrs: { href: site.url } })
          .run(),
    },
  ];
}

export const BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: 'text',
    title: 'Text',
    hint: 'Plain writing',
    group: 'Basic blocks',
    icon: Pilcrow,
    keywords: 'paragraph plain body',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().run(),
    isActive: (editor) => editor.isActive('paragraph'),
  },
  ...([1, 2, 3] as const).map(
    (level): BlockCommand => ({
      id: `h${level}`,
      title: `Heading ${level}`,
      hint: ['Page title', 'Section', 'Subsection'][level - 1]!,
      group: 'Basic blocks',
      icon: [Heading1, Heading2, Heading3][level - 1]!,
      keywords: `title header h${level} heading`,
      markdown: `${'#'.repeat(level)} `,
      turnInto: true,
      run: (editor) => chain(editor).setHeading({ level }).run(),
      isActive: (editor) => editor.isActive('heading', { level }),
    }),
  ),
  {
    id: 'quote',
    title: 'Quote',
    hint: 'Set a passage apart',
    group: 'Basic blocks',
    icon: Quote,
    keywords: 'blockquote citation',
    markdown: '> ',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
  {
    id: 'callout',
    title: 'Callout',
    hint: 'A tinted box with an icon',
    group: 'Basic blocks',
    icon: MessageSquareQuote,
    keywords: 'note tip info warning box aside',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().wrapIn('callout').run(),
    isActive: (editor) => editor.isActive('callout'),
  },
  {
    id: 'toggle',
    title: 'Toggle',
    hint: 'Fold details under a title',
    group: 'Basic blocks',
    icon: ChevronRight,
    keywords: 'collapse fold details accordion expand',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().wrapIn('toggle').run(),
    isActive: (editor) => editor.isActive('toggle'),
  },
  {
    id: 'divider',
    title: 'Divider',
    hint: 'A thin rule between sections',
    group: 'Basic blocks',
    icon: Minus,
    keywords: 'hr rule line separator',
    markdown: '---',
    run: (editor) => chain(editor).setHorizontalRule().run(),
  },
  {
    id: 'bullets',
    title: 'Bulleted list',
    hint: 'A simple list',
    group: 'Lists',
    icon: List,
    keywords: 'ul unordered points',
    markdown: '- ',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    id: 'numbers',
    title: 'Numbered list',
    hint: 'Steps in order',
    group: 'Lists',
    icon: ListOrdered,
    keywords: 'ol ordered steps',
    markdown: '1. ',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    id: 'todo',
    title: 'To-do list',
    hint: 'Things to tick off',
    group: 'Lists',
    icon: ListChecks,
    keywords: 'task checkbox check todo',
    markdown: '[] ',
    turnInto: true,
    run: (editor) => chain(editor).setParagraph().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskList'),
  },
  {
    id: 'toc',
    title: 'Table of contents',
    hint: 'The headings, kept up to date',
    group: 'Advanced',
    icon: ListTree,
    keywords: 'toc outline contents headings index',
    run: (editor) => chain(editor).insertContent({ type: 'toc' }).run(),
  },
  {
    id: 'table',
    title: 'Table',
    hint: 'Rows and columns',
    group: 'Advanced',
    icon: Table,
    keywords: 'grid spreadsheet columns rows',
    run: (editor) =>
      chain(editor)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: 'code',
    title: 'Code',
    hint: 'With syntax colours',
    group: 'Advanced',
    icon: Code2,
    keywords: 'snippet program source pre',
    markdown: '``` ',
    turnInto: true,
    run: (editor) => chain(editor).setCodeBlock().run(),
    isActive: (editor) =>
      editor.isActive('codeBlock') &&
      !['mermaid', 'sketch'].includes(
        editor.getAttributes('codeBlock').language,
      ),
  },
  {
    id: 'math',
    title: 'Math block',
    hint: 'LaTeX, typeset',
    group: 'Advanced',
    icon: Sigma,
    keywords: 'latex equation formula katex tex',
    markdown: '$$',
    run: () =>
      useNoteUi
        .getState()
        .set({ math: { pos: null, latex: '', inline: false } }),
  },
  {
    id: 'inline-math',
    title: 'Inline math',
    hint: 'A formula inside a line',
    group: 'Advanced',
    icon: SquareFunction,
    keywords: 'latex equation formula katex tex inline',
    markdown: '$',
    run: () =>
      useNoteUi
        .getState()
        .set({ math: { pos: null, latex: '', inline: true } }),
  },
  {
    id: 'mermaid',
    title: 'Diagram',
    hint: 'Flowcharts and more, in Mermaid',
    group: 'Media and embeds',
    icon: Network,
    keywords: 'mermaid chart flowchart graph sequence gantt',
    run: (editor) =>
      chain(editor)
        .setCodeBlock({ language: 'mermaid' })
        .insertContent('graph LR\n  Idea --> Note --> Link')
        .run(),
  },
  {
    id: 'sketch',
    title: 'Sketch',
    hint: 'Draw by hand',
    group: 'Media and embeds',
    icon: PenTool,
    keywords: 'draw drawing pen ink doodle',
    run: () => useNoteUi.getState().set({ sketch: { pos: null, source: '' } }),
  },
];

/** Commands matching what was typed after `/`, best first. */
export function filterCommands(
  commands: BlockCommand[],
  query: string,
): BlockCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const scored = commands
    .map((command) => {
      const title = command.title.toLowerCase();
      const score = title.startsWith(q)
        ? 3
        : title.split(/\s+/).some((word) => word.startsWith(q))
          ? 2
          : `${command.keywords} ${command.id}`.includes(q)
            ? 1
            : 0;
      return { command, score };
    })
    .filter((entry) => entry.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.command);
}

/** Removes the typed `/query` and runs the command in its place. */
export function runCommand(
  editor: Editor,
  range: Range,
  command: BlockCommand,
) {
  editor.chain().focus().deleteRange(range).run();
  command.run(editor);
}
