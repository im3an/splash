import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { BlockHandle } from './BlockHandle';
import { BLOCK_COMMANDS, pageBookmarkCommand } from './commands';
import { noteExtensions } from './extensions';
import { MathEditor } from './MathEditor';
import { openLink } from './open-link';
import { SelectionToolbar } from './SelectionToolbar';
import { SketchEditor } from './SketchPad';

export interface NoteEditorHandle {
  /** Adds a card for a page below the caret, or at the end. */
  insertBookmark(href: string): void;
  /** Scrolls to the nth heading, as the outline counts them. */
  revealHeading(index: number): void;
  focus(): void;
}

export interface NoteStats {
  words: number;
  characters: number;
}

const SAVE_DELAY_MS = 200;
const URL_ONLY = /^https?:\/\/\S+$/i;

/**
 * The note as a document you write in directly: Markdown shortcuts as you
 * type, `/` for blocks, a toolbar over selections, a handle beside blocks.
 * It reads and writes Markdown, so the note on disk stays plain text.
 */
export function NoteEditor({
  markdown,
  site,
  onChange,
  onStats,
  onActiveHeading,
  ref,
}: {
  markdown: string;
  /** The page in front, offered as a card in the block menu. */
  site: { url: string; title: string } | null;
  onChange: (markdown: string) => void;
  onStats: (stats: NoteStats) => void;
  onActiveHeading: (index: number) => void;
  ref: Ref<NoteEditorHandle>;
}) {
  const siteRef = useRef(site);
  siteRef.current = site;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const statsRef = useRef(onStats);
  statsRef.current = onStats;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const editor = useEditor({
    extensions: noteExtensions({
      commands: () => [
        ...pageBookmarkCommand(siteRef.current),
        ...BLOCK_COMMANDS,
      ],
    }),
    content: markdown,
    contentType: 'markdown',
    autofocus: markdown.trim() ? false : 'start',
    editorProps: {
      attributes: {
        class: 'note-prose',
        spellcheck: 'true',
        'aria-label': 'Note',
      },
      // ⌘-click follows a link; a plain click puts the caret in it.
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement).closest('a[href]');
        if (!link || !(event.metaKey || event.ctrlKey)) return false;
        openLink(link.getAttribute('href') ?? '');
        return true;
      },
      // A lone address pasted on an empty line becomes a card.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
        const { $from, empty } = view.state.selection;
        if (
          !URL_ONLY.test(text) ||
          !empty ||
          $from.parent.type.name !== 'paragraph' ||
          $from.parent.content.size > 0 ||
          $from.depth > 1
        )
          return false;
        const bookmark = view.state.schema.nodes.bookmark?.create({
          href: text,
        });
        if (!bookmark) return false;
        view.dispatch(
          view.state.tr.replaceWith($from.before(), $from.after(), bookmark),
        );
        return true;
      },
    },
    onUpdate: ({ editor: changed }) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        changeRef.current(changed.getMarkdown());
      }, SAVE_DELAY_MS);
      reportStats(changed);
    },
    onCreate: ({ editor: created }) => reportStats(created),
  });

  function reportStats(target: Editor) {
    const storage = target.storage.characterCount as {
      words: () => number;
      characters: () => number;
    };
    statsRef.current({
      words: storage.words(),
      characters: storage.characters(),
    });
  }

  // Whatever is still waiting is written when the note closes or switches.
  useEffect(
    () => () => {
      if (saveTimer.current && !editor.isDestroyed) {
        clearTimeout(saveTimer.current);
        changeRef.current(editor.getMarkdown());
      }
    },
    [editor],
  );

  // The heading at the top of the reading area, for the outline.
  useEffect(() => {
    const root = editor.view.dom;
    const scroller = root.closest('.notes-scroll');
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headings = [...root.querySelectorAll('h1, h2, h3, h4')];
        const line = scroller.getBoundingClientRect().top + 120;
        let active = 0;
        headings.forEach((heading, index) => {
          if (heading.getBoundingClientRect().top <= line) active = index;
        });
        onActiveHeading(active);
      });
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    editor.on('update', update);
    return () => {
      scroller.removeEventListener('scroll', update);
      editor.off('update', update);
      cancelAnimationFrame(frame);
    };
  }, [editor, onActiveHeading]);

  useImperativeHandle(ref, () => ({
    insertBookmark(href) {
      const { $to } = editor.state.selection;
      const at =
        editor.isFocused && $to.depth >= 1
          ? $to.after(1)
          : editor.state.doc.content.size;
      editor
        .chain()
        .insertContentAt(at, { type: 'bookmark', attrs: { href } })
        .focus()
        .run();
    },
    revealHeading(index) {
      const heading = editor.view.dom.querySelectorAll('h1, h2, h3, h4')[index];
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    focus() {
      editor.commands.focus();
    },
  }));

  return (
    <>
      <EditorContent editor={editor} className="note-editor-root" />
      <BlockHandle editor={editor} />
      <SelectionToolbar editor={editor} />
      <MathEditor editor={editor} />
      <SketchEditor editor={editor} />
    </>
  );
}
