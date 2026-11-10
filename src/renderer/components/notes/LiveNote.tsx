import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { Note } from '../../../shared/notes';
import { api } from '../../splash-api';
import { useOverlay } from '../../stores/overlay-store';
import { useNotes } from '../../stores/notes-store';
import { blockKind, splitBlocks, type Block } from './blocks';
import { renderDiagrams, renderNote } from './render-note';

export interface LiveNoteHandle {
  /** Puts text at the caret of the block being written, or at the end. */
  insert(text: string): void;
  /** Scrolls to the block holding a line of the note. */
  reveal(line: number): void;
}

/** The part of the note being written, as offsets into its text. */
interface Active {
  start: number;
  end: number;
  caret: number;
}

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** Lines before an offset, so blocks after the active one keep their lines. */
const lineAt = (body: string, offset: number) =>
  body.slice(0, offset).split('\n').length - 1;

function openLink(href: string) {
  if (!/^https?:\/\//i.test(href)) return;
  // A new page in the trail; notes step aside for it.
  void api()
    .createPage(href)
    .then(() => useOverlay.getState().close());
}

/**
 * The note, rendered as you write it. Every block shows finished; the one
 * you click turns into its Markdown, set in the size it renders at, and
 * diagrams and math draw beneath their source as you type.
 */
export function LiveNote({
  note,
  ref,
}: {
  note: Note;
  ref: Ref<LiveNoteHandle>;
}) {
  const edit = useNotes((state) => state.edit);
  const [active, setActive] = useState<Active | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const body = note.body;

  // An empty note is ready to write.
  useEffect(() => {
    setActive(
      note.body.trim() ? null : { start: 0, end: note.body.length, caret: 0 },
    );
    // Only when switching notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const before = useMemo(
    () => splitBlocks(active ? body.slice(0, active.start) : body),
    [body, active],
  );
  const after = useMemo(
    () =>
      active
        ? splitBlocks(
            body.slice(active.end),
            active.end,
            lineAt(body, active.end),
          )
        : [],
    [body, active],
  );

  const write = (next: string, range: Active) => {
    edit(note.id, { body: next });
    setActive(range);
  };

  /** Writes one block, caret at its end unless said otherwise. */
  const open = (block: Pick<Block, 'start' | 'end'>, caret = block.end) =>
    setActive({ start: block.start, end: block.end, caret });

  /** Starts a fresh block after everything else. */
  const openEnd = () => {
    const trimmed = body.replace(/\s+$/, '');
    const next = trimmed ? `${trimmed}\n\n` : '';
    if (next !== body) edit(note.id, { body: next });
    setActive({ start: next.length, end: next.length, caret: next.length });
  };

  useImperativeHandle(ref, () => ({
    insert(text) {
      if (active) {
        const caret =
          field.current?.selectionStart ?? active.caret - active.start;
        const at = active.start + caret;
        const next = body.slice(0, at) + text + body.slice(at);
        write(next, {
          start: active.start,
          end: active.end + text.length,
          caret: at + text.length,
        });
        return;
      }
      edit(note.id, { body: `${body.trimEnd()}\n\n${text.trim()}\n` });
    },
    reveal(line) {
      const blocks = [
        ...document.querySelectorAll<HTMLElement>('.note-live [data-line]'),
      ];
      const target = blocks
        .filter((element) => Number(element.dataset.line) <= line)
        .at(-1);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }));

  // Keep the caret where the last change left it, across re-renders that
  // swap which block is open.
  useLayoutEffect(() => {
    const element = field.current;
    if (!active || !element) return;
    if (document.activeElement !== element)
      element.focus({ preventScroll: true });
    const caret = Math.max(
      0,
      Math.min(active.caret - active.start, element.value.length),
    );
    if (element.selectionStart !== caret || element.selectionEnd !== caret)
      element.setSelectionRange(caret, caret);
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [active, body]);

  const value = active ? body.slice(active.start, active.end) : '';
  const kind = blockKind(value);

  return (
    <article className="note-doc note-live">
      {/* Keyed by text, so typing above doesn't redraw what's below. */}
      {before.map((block, index) => (
        <LiveBlock
          key={`b${index}:${body.slice(block.start, block.end)}`}
          block={block}
          text={body.slice(block.start, block.end)}
          onOpen={() => open(block)}
        />
      ))}

      {active && (
        <div className="note-live-active" data-kind={kind}>
          <textarea
            ref={field}
            value={value}
            rows={1}
            spellCheck
            aria-label="Write in Markdown"
            placeholder={
              before.length || after.length
                ? 'Write, or start with # for a heading…'
                : '# Give it a title'
            }
            className="note-live-source"
            data-kind={kind}
            onChange={(event) => {
              const text = event.target.value;
              write(
                body.slice(0, active.start) + text + body.slice(active.end),
                {
                  start: active.start,
                  end: active.start + text.length,
                  caret: active.start + event.target.selectionStart,
                },
              );
            }}
            onSelect={(event) => {
              const caret = active.start + event.currentTarget.selectionStart;
              if (caret !== active.caret) setActive({ ...active, caret });
            }}
            // Blocks keep focus here on mousedown, so a blur means leaving.
            onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              const element = event.currentTarget;
              const { selectionStart: from, selectionEnd: to } = element;
              const atStart = from === 0 && to === 0;
              const atEnd = from === element.value.length && to === from;
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setActive(null);
                element.blur();
              } else if (event.key === 'ArrowUp' && atStart && before.length) {
                event.preventDefault();
                open(before.at(-1)!);
              } else if (event.key === 'ArrowDown' && atEnd && after.length) {
                event.preventDefault();
                open(after[0]!, after[0]!.start);
              } else if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                atEnd &&
                (kind === 'h1' ||
                  kind === 'h2' ||
                  kind === 'h3' ||
                  element.value.endsWith('\n'))
              ) {
                // A heading, or a blank line typed at the end, starts the
                // next block.
                event.preventDefault();
                const head = body.slice(0, active.end).replace(/\n+$/, '');
                const tail = body.slice(active.end).replace(/^\n+/, '');
                const next = `${head}\n\n${tail ? `\n\n${tail}` : ''}`;
                const at = head.length + 2;
                write(next, { start: at, end: at, caret: at });
              } else if (
                event.key === 'Backspace' &&
                atStart &&
                !element.value &&
                before.length
              ) {
                // Backspace in an empty block joins the one above.
                event.preventDefault();
                const previous = before.at(-1)!;
                const rest = body.slice(active.end).replace(/^\n+/, '');
                const next =
                  body.slice(0, previous.end) + (rest ? `\n\n${rest}` : '');
                write(next, {
                  start: previous.start,
                  end: previous.end,
                  caret: previous.end,
                });
              } else if (event.key === 'Tab' && !event.metaKey) {
                event.preventDefault();
                const text = `${element.value.slice(0, from)}  ${element.value.slice(to)}`;
                write(
                  body.slice(0, active.start) + text + body.slice(active.end),
                  {
                    start: active.start,
                    end: active.start + text.length,
                    caret: active.start + from + 2,
                  },
                );
              }
            }}
          />
          {(kind === 'code' || kind === 'math') && <LivePreview text={value} />}
        </div>
      )}

      {after.map((block, index) => (
        <LiveBlock
          key={`a${index}:${body.slice(block.start, block.end)}`}
          block={block}
          text={body.slice(block.start, block.end)}
          onOpen={() => open(block)}
        />
      ))}

      <button
        type="button"
        className="note-live-more"
        aria-label="Write at the end"
        onMouseDown={(event) => {
          event.preventDefault();
          openEnd();
        }}
      />
    </article>
  );
}

/** One finished block. A click writes it; a click on a link follows it. */
function LiveBlock({
  block,
  text,
  onOpen,
}: {
  block: Block;
  text: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderNote(text), [text]);
  useRendered(ref, html);
  return (
    <div
      ref={ref}
      className="note-live-block"
      data-line={block.line}
      data-kind={block.kind}
      onMouseDown={(event) => {
        const link = (event.target as HTMLElement).closest('a[href]');
        if (link) return;
        // Selecting text to copy shouldn't start writing.
        if (event.detail > 1) return;
        event.preventDefault();
        onOpen();
      }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest('a[href]');
        if (!link) return;
        event.preventDefault();
        openLink(link.getAttribute('href') ?? '');
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** What a diagram or formula draws to, a moment after typing stops. */
function LivePreview({ text }: { text: string }) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderNote(settled), [settled]);
  useRendered(ref, html);
  return (
    <div
      ref={ref}
      className="note-live-preview"
      aria-label="Preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Diagrams draw after the HTML lands; card icons show once they load. */
function useRendered(ref: React.RefObject<HTMLElement | null>, html: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const icon of root.querySelectorAll<HTMLImageElement>(
      '.note-card-icon',
    )) {
      icon.addEventListener('load', () => (icon.dataset.loaded = 'true'));
      icon.addEventListener('error', () => icon.remove());
    }
    void renderDiagrams(root, dark());
  }, [ref, html]);
}
