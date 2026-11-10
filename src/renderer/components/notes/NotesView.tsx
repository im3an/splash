import { useEffect, useMemo, useRef, useState } from 'react';
import { Code, Link2, Plus, Shapes, Trash2, X } from 'lucide-react';
import {
  noteOutline,
  noteSites,
  noteTitle,
  siteKey,
  type Note,
} from '../../../shared/notes';
import { pageParts } from '../../lib/format';
import { useOverlay } from '../../stores/overlay-store';
import { selectActivePage, useShell } from '../../stores/shell-store';
import { useNotes } from '../../stores/notes-store';
import { SiteIcon } from '../Favicon';
import { NotesMark } from './NotesMark';
import { SketchPad } from './SketchPad';
import { LiveNote, type LiveNoteHandle } from './LiveNote';
import 'katex/dist/katex.min.css';
import './notes.css';

const STARTER = `# Untitled note

Write in **Markdown**. Headings build the outline on the left.

## Links

Paste a link on its own line and it becomes a card, and ties this note to that site:

https://en.wikipedia.org/wiki/Markdown

## Math

Inline $e^{i\\pi} + 1 = 0$, or a block:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Diagram

\`\`\`mermaid
graph LR
  Read --> Note --> Link
  Link --> Read
\`\`\`
`;

/** The page in front, as notes see it: its site, address and title. */
function useCurrentSite() {
  const page = useShell(selectActivePage);
  return useMemo(() => {
    const key = siteKey(page?.url);
    if (!page?.url || !key) return null;
    return { key, url: page.url, title: pageParts(page).title || key };
  }, [page]);
}

/**
 * Notes over the page area: a quiet two-column document, the outline and
 * other notes on the left, the note itself on the right, rendered as you
 * write it. ⌘E shows the whole Markdown source.
 */
export function NotesView() {
  const notes = useNotes((state) => state.notes);
  const loaded = useNotes((state) => state.loaded);
  const activeId = useNotes((state) => state.activeId);
  const note = notes.find((item) => item.id === activeId) ?? null;
  const site = useCurrentSite();
  const [editing, setEditing] = useState(false);
  const [sketching, setSketching] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const liveRef = useRef<LiveNoteHandle>(null);

  // Switching notes leaves the source view.
  useEffect(() => {
    setEditing(false);
    // Only when switching notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (sketching) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editing) setEditing(false);
        else close();
      }
      if (event.key === 'e' && event.metaKey && note) {
        event.preventDefault();
        setEditing((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, sketching, note]);

  useEffect(
    () => () => {
      void useNotes.getState().flush();
    },
    [],
  );

  const close = () => {
    void useNotes.getState().flush();
    useOverlay.getState().close();
  };

  const newNote = () => {
    useNotes.getState().create(STARTER);
  };

  const notesHere = site
    ? notes.filter((item) => noteSites(item).includes(site.key))
    : [];

  const insert = (text: string) => {
    if (!note) return;
    const editor = editorRef.current;
    if (!editing) return liveRef.current?.insert(text);
    if (editor) {
      const start = editor.selectionStart;
      const body =
        note.body.slice(0, start) + text + note.body.slice(editor.selectionEnd);
      useNotes.getState().edit(note.id, { body });
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = editor.selectionEnd = start + text.length;
      });
    } else {
      useNotes
        .getState()
        .edit(note.id, { body: `${note.body.trimEnd()}\n\n${text.trim()}\n` });
    }
  };

  const linkPage = () => {
    if (!note || !site) return;
    insert(`\n\n${site.url}\n\n`);
    if (!note.sites.includes(site.key)) {
      useNotes.getState().edit(note.id, { sites: [...note.sites, site.key] });
    }
  };

  const jumpTo = (_slug: string, line: number) => {
    const editor = editorRef.current;
    if (editing && editor && note) {
      const offset = note.body.split('\n').slice(0, line).join('\n').length;
      editor.focus();
      editor.setSelectionRange(
        offset + (line ? 1 : 0),
        offset + (line ? 1 : 0),
      );
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
      scrollRef.current?.scrollTo({
        top: editor.offsetTop + line * lineHeight - 80,
        behavior: 'smooth',
      });
      return;
    }
    liveRef.current?.reveal(line);
  };

  return (
    <section
      aria-label="Notes"
      className="notes-view overlay-in absolute inset-0 z-10 flex flex-col"
    >
      <div ref={scrollRef} className="notes-scroll min-h-0 flex-1">
        <div className="notes-layout">
          <aside className="notes-rail" aria-label="Notes outline">
            <div className="notes-rail-inner">
              <NotesMark className="notes-logo" size={22} />
              {note && <Outline note={note} onJump={jumpTo} />}
              <hr className="notes-rule" />
              {site && notesHere.length > 0 && (
                <p className="notes-rail-label">
                  <SiteIcon url={null} site={site.url} />
                  <span className="truncate">{site.key}</span>
                </p>
              )}
              <NoteList
                notes={notes}
                activeId={activeId}
                highlight={site?.key ?? null}
              />
              <button
                type="button"
                className="notes-rail-new"
                onClick={newNote}
              >
                <Plus size={14} aria-hidden />
                New note
              </button>
            </div>
          </aside>

          <main className="notes-main">
            {!loaded ? null : note ? (
              editing ? (
                <Editor ref={editorRef} note={note} />
              ) : (
                <LiveNote ref={liveRef} note={note} />
              )
            ) : (
              <Empty onCreate={newNote} />
            )}
          </main>
        </div>
      </div>

      <div className="notes-tools" role="toolbar" aria-label="Note tools">
        {note && (
          <>
            <ToolButton
              label={
                editing ? 'Back to live view (⌘E)' : 'Markdown source (⌘E)'
              }
              pressed={editing}
              onClick={() => setEditing((value) => !value)}
            >
              <Code size={15} />
            </ToolButton>
            <ToolButton label="Sketch" onClick={() => setSketching(true)}>
              <Shapes size={15} />
            </ToolButton>
            {site && (
              <ToolButton label={`Link ${site.key}`} onClick={linkPage}>
                <Link2 size={15} />
              </ToolButton>
            )}
            <ToolButton
              label="Delete note"
              onClick={() => {
                if (confirm(`Delete “${noteTitle(note.body)}”?`))
                  useNotes.getState().remove(note.id);
              }}
            >
              <Trash2 size={15} />
            </ToolButton>
            <span className="notes-tools-gap" />
          </>
        )}
        <ToolButton label="Close notes (Esc)" onClick={close}>
          <X size={15} />
        </ToolButton>
      </div>

      {sketching && (
        <SketchPad
          onCancel={() => setSketching(false)}
          onInsert={(block) => {
            setSketching(false);
            insert(`\n\n${block}\n\n`);
          }}
        />
      )}
    </section>
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="notes-tool"
    >
      {children}
    </button>
  );
}

/** The note's headings, indented by level: built from the text as you type. */
function Outline({
  note,
  onJump,
}: {
  note: Note;
  onJump: (slug: string, line: number) => void;
}) {
  const outline = useMemo(() => noteOutline(note.body), [note.body]);
  const top = outline.length ? Math.min(...outline.map((e) => e.level)) : 1;
  const title = noteTitle(note.body);
  const entries =
    outline[0]?.level === top && outline[0].text === title
      ? outline.slice(1)
      : outline;
  return (
    <nav className="notes-outline" aria-label="Headings">
      <button
        type="button"
        className="notes-outline-title"
        onClick={() => onJump(outline[0]?.slug ?? '', outline[0]?.line ?? 0)}
      >
        {title}
      </button>
      {entries.map((entry) => (
        <button
          key={`${entry.slug}-${entry.line}`}
          type="button"
          className="notes-outline-item"
          style={{ paddingLeft: Math.max(0, entry.level - top - 1) * 12 }}
          onClick={() => onJump(entry.slug, entry.line)}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );
}

function NoteList({
  notes,
  activeId,
  highlight,
}: {
  notes: Note[];
  activeId: string | null;
  highlight: string | null;
}) {
  const select = useNotes((state) => state.select);
  // This site's notes first, then the rest by when they changed.
  const ordered = [...notes].sort((a, b) => {
    const ah = highlight && noteSites(a).includes(highlight) ? 1 : 0;
    const bh = highlight && noteSites(b).includes(highlight) ? 1 : 0;
    return bh - ah || b.updatedAt - a.updatedAt;
  });
  return (
    <ul className="notes-list">
      {ordered.map((item) => {
        const sites = noteSites(item);
        const here = highlight !== null && sites.includes(highlight);
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={item.id === activeId}
              data-here={here}
              className="notes-list-item"
              onClick={() => select(item.id)}
            >
              <span className="notes-list-icon">
                {sites[0] ? (
                  <SiteIcon
                    url={null}
                    site={`https://${sites[0]}`}
                    fallback={<NotesMark size={14} />}
                  />
                ) : (
                  <NotesMark size={14} />
                )}
              </span>
              <span className="truncate">{noteTitle(item.body)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Editor({
  note,
  ref,
}: {
  note: Note;
  ref: React.Ref<HTMLTextAreaElement>;
}) {
  const edit = useNotes((state) => state.edit);
  const local = useRef<HTMLTextAreaElement | null>(null);
  // Grow with the text, so the page scrolls rather than the field.
  useEffect(() => {
    const field = local.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [note.body]);
  return (
    <textarea
      ref={(element) => {
        local.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      autoFocus
      spellCheck
      aria-label="Note text"
      className="note-editor"
      value={note.body}
      placeholder="# A heading starts the outline…"
      onChange={(event) => edit(note.id, { body: event.target.value })}
      onKeyDown={(event) => {
        // Tab indents rather than leaving the field.
        if (event.key !== 'Tab' || event.metaKey) return;
        event.preventDefault();
        const field = event.currentTarget;
        const start = field.selectionStart;
        const body =
          note.body.slice(0, start) +
          '  ' +
          note.body.slice(field.selectionEnd);
        edit(note.id, { body });
        requestAnimationFrame(() => {
          field.selectionStart = field.selectionEnd = start + 2;
        });
      }}
    />
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="note-doc">
      <h1>Notes</h1>
      <p>
        Markdown notes that sit beside your trails. Links tie a note to their
        site, so the note shows up when you visit it again. Sketches, Mermaid
        diagrams and LaTeX work too.
      </p>
      <p>
        <button type="button" className="notes-cta" onClick={onCreate}>
          <Plus size={14} aria-hidden /> Start a note
        </button>
      </p>
    </div>
  );
}
