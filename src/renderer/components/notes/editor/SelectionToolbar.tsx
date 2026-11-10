import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  ChevronDown,
  Code,
  ExternalLink,
  Highlighter,
  Italic,
  Link2,
  Sigma,
  Strikethrough,
  Underline,
  Unlink,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BLOCK_COMMANDS } from './commands';
import { HIGHLIGHTS } from './extensions';
import { openLink } from './open-link';
import { useNoteUi } from './ui-store';

const TURN_INTO = BLOCK_COMMANDS.filter((command) => command.turnInto);

/**
 * Formatting over a selection, Notion-style: what the block is, the marks,
 * a link field. With the caret in a link and nothing selected, it offers the
 * link itself: open, edit, remove.
 */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [turning, setTurning] = useState(false);
  const [colouring, setColouring] = useState(false);
  const linkRequest = useNoteUi((state) => state.linkRequest);
  useEffect(() => {
    if (linkRequest) setLinking(true);
  }, [linkRequest]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      href: String(e.getAttributes('link').href ?? ''),
      empty: e.state.selection.empty,
      block:
        TURN_INTO.find((command) => command.isActive?.(e))?.title ?? 'Text',
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 12 },
      }}
      shouldShow={({ editor: e, state: s, from, to }) => {
        if (!e.isEditable || !e.isFocused) return false;
        const $from = s.doc.resolve(from);
        if ($from.parent.type.spec.code) return false;
        if ('node' in s.selection) return false;
        if (from === to) return e.isActive('link');
        return s.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
      className="note-pop note-toolbar"
      onMouseDown={(event) => {
        // Keep the selection: buttons act on it.
        if (!(event.target as HTMLElement).closest('input'))
          event.preventDefault();
      }}
    >
      {linking ? (
        <LinkField
          initial={state.href}
          onDone={(href) => {
            setLinking(false);
            const chain = editor.chain().focus().extendMarkRange('link');
            if (href === null) return;
            if (!href) chain.unsetLink().run();
            else chain.setLink({ href: normaliseHref(href) }).run();
          }}
        />
      ) : state.empty && state.link ? (
        <>
          <span className="note-toolbar-url" title={state.href}>
            {state.href.replace(/^https?:\/\/(www\.)?/, '')}
          </span>
          <ToolbarButton label="Open link" onClick={() => openLink(state.href)}>
            <ExternalLink size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Edit link (⌘⇧K)"
            onClick={() => setLinking(true)}
          >
            <Link2 size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Remove link"
            onClick={() =>
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
            }
          >
            <Unlink size={15} />
          </ToolbarButton>
        </>
      ) : (
        <>
          <span className="note-toolbar-turn">
            <button
              type="button"
              className="note-toolbar-block"
              aria-haspopup="menu"
              aria-expanded={turning}
              onClick={() => setTurning((open) => !open)}
            >
              {state.block}
              <ChevronDown size={13} aria-hidden />
            </button>
            {turning && (
              <span
                className="note-pop note-menu note-toolbar-menu"
                role="menu"
              >
                <span className="note-menu-label">Turn into</span>
                {TURN_INTO.map((command) => {
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={command.title === state.block}
                      className="note-menu-item"
                      onClick={() => {
                        setTurning(false);
                        command.run(editor);
                      }}
                    >
                      <Icon size={15} aria-hidden />
                      {command.title}
                    </button>
                  );
                })}
              </span>
            )}
          </span>
          <span className="note-toolbar-sep" />
          <ToolbarButton
            label="Bold (⌘B)"
            on={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Italic (⌘I)"
            on={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Underline (⌘U)"
            on={state.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough (⌘⇧X)"
            on={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Code (⌘E)"
            on={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={15} />
          </ToolbarButton>
          <span className="note-toolbar-turn">
            <ToolbarButton
              label="Highlight (⌘⇧E)"
              on={state.highlight}
              onClick={() => setColouring((open) => !open)}
            >
              <Highlighter size={15} />
            </ToolbarButton>
            {colouring && (
              <span
                className="note-pop note-menu note-toolbar-menu note-colours"
                role="menu"
              >
                <span className="note-menu-label">Highlight</span>
                <span className="note-colour-row">
                  <button
                    type="button"
                    role="menuitem"
                    className="note-colour"
                    data-color="default"
                    aria-label="Highlight"
                    onClick={() => {
                      setColouring(false);
                      editor.chain().focus().setHighlight().run();
                    }}
                  />
                  {HIGHLIGHTS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="menuitem"
                      className="note-colour"
                      data-color={color}
                      aria-label={`${color[0]!.toUpperCase()}${color.slice(1)} highlight`}
                      onClick={() => {
                        setColouring(false);
                        editor.chain().focus().setHighlight({ color }).run();
                      }}
                    />
                  ))}
                </span>
                <button
                  type="button"
                  role="menuitem"
                  className="note-menu-item"
                  onClick={() => {
                    setColouring(false);
                    editor.chain().focus().unsetHighlight().run();
                  }}
                >
                  No highlight
                </button>
              </span>
            )}
          </span>
          <span className="note-toolbar-sep" />
          <ToolbarButton
            label="Link (⌘⇧K)"
            on={state.link}
            onClick={() => setLinking(true)}
          >
            <Link2 size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Turn into math"
            onClick={() => {
              const { from, to } = editor.state.selection;
              const latex = editor.state.doc.textBetween(from, to, ' ');
              editor
                .chain()
                .focus()
                .deleteRange({ from, to })
                .insertInlineMath({ latex })
                .run();
            }}
          >
            <Sigma size={15} />
          </ToolbarButton>
        </>
      )}
    </BubbleMenu>
  );
}

function ToolbarButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="note-toolbar-button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Adds https:// to a bare address; leaves mailto: and the rest alone. */
export function normaliseHref(input: string): string {
  const value = input.trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) return `https://${value}`;
  return value;
}

function LinkField({
  initial,
  onDone,
}: {
  initial: string;
  /** `null` cancels; an empty string removes the link. */
  onDone: (href: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <form
      className="note-toolbar-link"
      onSubmit={(event) => {
        event.preventDefault();
        onDone(ref.current?.value ?? '');
      }}
    >
      <Link2 size={14} aria-hidden />
      <input
        ref={ref}
        defaultValue={initial}
        placeholder="Paste or type a link…"
        aria-label="Link address"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onDone(null);
          }
        }}
        onBlur={() => onDone(null)}
      />
      <kbd className="note-kbd">↵</kbd>
    </form>
  );
}
