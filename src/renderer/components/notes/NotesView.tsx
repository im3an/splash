import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  Link2,
  MoreHorizontal,
  PanelLeft,
  Pin,
  PinOff,
  Plus,
  Search,
  SmilePlus,
  Trash2,
  Type,
  X,
} from '../../icons';
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
import {
  readFrontMatter,
  writeFrontMatter,
  type NoteFont,
  type NoteLook,
} from './editor/front-matter';
import {
  NoteEditor,
  type NoteEditorHandle,
  type NoteStats,
} from './editor/NoteEditor';
import 'katex/dist/katex.min.css';
import './notes.css';
import './editor/editor.css';

/** A new note: an empty title the placeholder names, ready to type. */
const STARTER = '# \n';

const NOTE_ICONS = [
  '📝',
  '📌',
  '💡',
  '🌱',
  '🧭',
  '📚',
  '🔖',
  '🗂️',
  '🧠',
  '🎯',
  '🚀',
  '⭐',
  '🔥',
  '🧪',
  '🛠️',
  '🎨',
  '🎧',
  '📷',
  '🌍',
  '🏔️',
  '☕',
  '🍃',
  '🌙',
  '☀️',
  '⚡',
  '🧩',
  '📈',
  '💬',
  '🗓️',
  '✅',
];

/** The page in front, as notes see it: its site, address and title. */
function useCurrentSite() {
  const page = useShell(selectActivePage);
  return useMemo(() => {
    const key = siteKey(page?.url);
    if (!page?.url || !key) return null;
    return { key, url: page.url, title: pageParts(page).title || key };
  }, [page]);
}

const lookOf = (note: Note) => readFrontMatter(note.body).look;

function ago(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Notes over the page area, laid out like a writing app: a sidebar of notes,
 * a bar with the note's place and tools, the page itself as a block editor,
 * and its outline down the right edge.
 */
export function NotesView() {
  const notes = useNotes((state) => state.notes);
  const loaded = useNotes((state) => state.loaded);
  const activeId = useNotes((state) => state.activeId);
  const note = notes.find((item) => item.id === activeId) ?? null;
  const site = useCurrentSite();
  const [source, setSource] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [stats, setStats] = useState<NoteStats>({ words: 0, characters: 0 });
  const [activeHeading, setActiveHeading] = useState(0);
  const [removed, setRemoved] = useState<Note | null>(null);
  const editorRef = useRef<NoteEditorHandle>(null);

  const parts = useMemo(
    () => (note ? readFrontMatter(note.body) : null),
    [note],
  );
  const outline = useMemo(
    () =>
      parts
        ? noteOutline(parts.markdown).filter((entry) => entry.level <= 4)
        : [],
    [parts],
  );

  useEffect(() => setSource(false), [note?.id]);

  const close = useCallback(() => {
    void useNotes.getState().flush();
    useOverlay.getState().close();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      // Menus and sheets take their own Escape.
      if (document.querySelector('.note-scrim, .note-slash-host')) return;
      const focused = document.activeElement as HTMLElement | null;
      // First Escape leaves the text; the next closes notes.
      if (focused?.closest('.ProseMirror, input, textarea')) {
        event.preventDefault();
        focused.blur();
        return;
      }
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(
    () => () => {
      void useNotes.getState().flush();
    },
    [],
  );

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 7000);
    return () => clearTimeout(timer);
  }, [removed]);

  /** Writes the editor's Markdown back under the note's own front matter. */
  const saveMarkdown = useCallback((id: string, markdown: string) => {
    const current = useNotes.getState().notes.find((item) => item.id === id);
    if (!current) return;
    const { look, extra } = readFrontMatter(current.body);
    const body = writeFrontMatter(look, markdown, extra);
    if (body !== current.body) useNotes.getState().edit(id, { body });
  }, []);

  const setLook = (patch: Partial<NoteLook>) => {
    if (!note || !parts) return;
    useNotes.getState().edit(note.id, {
      body: writeFrontMatter(
        { ...parts.look, ...patch },
        parts.markdown,
        parts.extra,
      ),
    });
  };

  const newNote = () => {
    setSource(false);
    useNotes.getState().create(STARTER);
  };

  const remove = (target: Note) => {
    useNotes.getState().remove(target.id);
    setRemoved(target);
  };

  const linkPage = () => {
    if (!note || !site) return;
    editorRef.current?.insertBookmark(site.url);
    if (!note.sites.includes(site.key))
      useNotes.getState().edit(note.id, { sites: [...note.sites, site.key] });
  };

  const look = parts?.look ?? null;

  return (
    <section
      aria-label="Notes"
      className="notes-view absolute inset-0 z-10"
      data-sidebar={sidebar}
    >
      {sidebar && (
        <NotesSidebar
          notes={notes}
          activeId={activeId}
          site={site}
          onNew={newNote}
          onCollapse={() => setSidebar(false)}
        />
      )}

      <div className="notes-main">
        <header className="notes-bar">
          {!sidebar && (
            <BarButton label="Show notes list" onClick={() => setSidebar(true)}>
              <PanelLeft size={16} />
            </BarButton>
          )}
          <nav className="notes-crumbs" aria-label="Location">
            <span className="notes-crumb-root">
              <NotesMark size={14} />
              Notes
            </span>
            {note && parts && (
              <>
                <span className="notes-crumb-sep" aria-hidden>
                  /
                </span>
                <span className="notes-crumb-page">
                  {look?.icon && <span aria-hidden>{look.icon}</span>}
                  <span className="truncate">{noteTitle(parts.markdown)}</span>
                </span>
              </>
            )}
          </nav>
          <span className="notes-bar-gap" />
          {note && look && (
            <>
              <span
                className="notes-bar-status"
                title={`${stats.characters.toLocaleString()} characters`}
              >
                Edited {ago(note.updatedAt)} · {stats.words.toLocaleString()}{' '}
                {stats.words === 1 ? 'word' : 'words'}
              </span>
              {site && (
                <BarButton
                  label={`Add a card for this page (${site.key})`}
                  onClick={linkPage}
                >
                  <Link2 size={16} />
                </BarButton>
              )}
              <TypeMenu look={look} onChange={setLook} />
              <MoreMenu
                note={note}
                look={look}
                source={source}
                onSource={() => setSource((value) => !value)}
                onPin={() => setLook({ pinned: !look.pinned })}
                onDelete={() => remove(note)}
              />
            </>
          )}
          <BarButton label="Close notes (Esc)" onClick={close}>
            <X size={16} />
          </BarButton>
        </header>

        <div className="notes-scroll">
          {!loaded ? null : note && parts && look ? (
            <article
              className="notes-page"
              data-font={look.font}
              data-small={look.small}
              data-wide={look.wide}
            >
              <IconSlot
                icon={look.icon}
                onChange={(icon) => setLook({ icon })}
              />
              {source ? (
                <SourceEditor note={note} />
              ) : (
                <NoteEditor
                  key={note.id}
                  ref={editorRef}
                  markdown={parts.markdown}
                  site={site}
                  onChange={(markdown) => saveMarkdown(note.id, markdown)}
                  onStats={setStats}
                  onActiveHeading={setActiveHeading}
                />
              )}
            </article>
          ) : (
            <Empty onCreate={newNote} />
          )}
        </div>

        {note && !source && outline.length > 1 && (
          <OutlineRail
            outline={outline}
            active={activeHeading}
            onJump={(index) => editorRef.current?.revealHeading(index)}
          />
        )}
      </div>

      {removed && (
        <div className="note-pop notes-toast" role="status">
          Deleted “{noteTitle(readFrontMatter(removed.body).markdown)}”
          <button
            type="button"
            onClick={() => {
              useNotes.getState().restore(removed);
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

function BarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="notes-bar-button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A small menu under a bar button; a click elsewhere or Escape closes it. */
function Popover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <span ref={ref} className="notes-popover-anchor">
      <BarButton
        label={label}
        pressed={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
      </BarButton>
      {open && (
        <div className="note-pop note-menu notes-popover" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}

const FONTS: { id: NoteFont; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
];

/** Typeface, size and width for this note. */
function TypeMenu({
  look,
  onChange,
}: {
  look: NoteLook;
  onChange: (patch: Partial<NoteLook>) => void;
}) {
  return (
    <Popover label="Text style" icon={<Type size={16} />}>
      {() => (
        <>
          <span className="note-menu-label">Style</span>
          <div className="notes-type-fonts">
            {FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                role="menuitemradio"
                aria-checked={look.font === font.id}
                className="notes-type-font"
                data-font={font.id}
                onClick={() => onChange({ font: font.id })}
              >
                <span className="notes-type-sample">Ag</span>
                <span className="notes-type-name">{font.label}</span>
              </button>
            ))}
          </div>
          <span className="note-menu-rule" />
          <Switch
            label="Small text"
            on={look.small}
            onChange={(small) => onChange({ small })}
          />
          <Switch
            label="Full width"
            on={look.wide}
            onChange={(wide) => onChange({ wide })}
          />
        </>
      )}
    </Popover>
  );
}

function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      className="note-menu-item notes-switch-row"
      onClick={() => onChange(!on)}
    >
      {label}
      <span className="notes-switch" data-on={on} aria-hidden />
    </button>
  );
}

function MoreMenu({
  note,
  look,
  source,
  onSource,
  onPin,
  onDelete,
}: {
  note: Note;
  look: NoteLook;
  source: boolean;
  onSource: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const title = noteTitle(readFrontMatter(note.body).markdown);
  return (
    <Popover label="More" icon={<MoreHorizontal size={16} />}>
      {(close) => {
        const item = (
          icon: ReactNode,
          label: string,
          run: () => void,
          danger = false,
        ) => (
          <button
            type="button"
            role="menuitem"
            className={`note-menu-item${danger ? ' note-menu-danger' : ''}`}
            onClick={() => {
              run();
              close();
            }}
          >
            {icon}
            {label}
          </button>
        );
        return (
          <>
            {item(
              look.pinned ? <PinOff size={15} /> : <Pin size={15} />,
              look.pinned ? 'Unpin' : 'Pin to top',
              onPin,
            )}
            {item(<Copy size={15} />, 'Duplicate', () => {
              const parts = readFrontMatter(note.body);
              useNotes
                .getState()
                .create(
                  writeFrontMatter(
                    { ...parts.look, pinned: false },
                    parts.markdown.replace(/^# (.*)$/m, '# $1 (copy)'),
                    parts.extra,
                  ),
                  note.sites,
                );
            })}
            <button
              type="button"
              role="menuitem"
              className="note-menu-item"
              onClick={() => {
                void navigator.clipboard.writeText(note.body).then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                    close();
                  }, 700);
                });
              }}
            >
              {copied ? <Check size={15} /> : <FileCode2 size={15} />}
              {copied ? 'Copied' : 'Copy as Markdown'}
            </button>
            {item(<Download size={15} />, 'Download as Markdown', () => {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(
                new Blob([note.body], { type: 'text/markdown' }),
              );
              link.download = `${title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80) || 'Note'}.md`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            })}
            <span className="note-menu-rule" />
            {item(
              <FileCode2 size={15} />,
              source ? 'Back to the editor' : 'Edit as Markdown',
              onSource,
            )}
            <span className="note-menu-rule" />
            {item(<Trash2 size={15} />, 'Delete', onDelete, true)}
          </>
        );
      }}
    </Popover>
  );
}

/** The note's icon above its title; hovering offers one when it has none. */
function IconSlot({
  icon,
  onChange,
}: {
  icon: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setPicking(false);
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [picking]);
  return (
    <div ref={ref} className="notes-icon-slot" data-has-icon={Boolean(icon)}>
      {icon ? (
        <button
          type="button"
          className="notes-icon"
          aria-label="Change icon"
          onClick={() => setPicking(true)}
        >
          {icon}
        </button>
      ) : (
        <button
          type="button"
          className="notes-add-icon"
          onClick={() => setPicking(true)}
        >
          <SmilePlus size={15} aria-hidden /> Add icon
        </button>
      )}
      {picking && (
        <div
          className="note-pop notes-icon-picker"
          role="menu"
          aria-label="Icons"
        >
          <div className="notes-icon-grid">
            {NOTE_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(emoji);
                  setPicking(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          {icon && (
            <button
              type="button"
              className="note-menu-item"
              onClick={() => {
                onChange(null);
                setPicking(false);
              }}
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NotesSidebar({
  notes,
  activeId,
  site,
  onNew,
  onCollapse,
}: {
  notes: Note[];
  activeId: string | null;
  site: { key: string; url: string } | null;
  onNew: () => void;
  onCollapse: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matching = notes.filter(
    (note) => !q || note.body.toLowerCase().includes(q),
  );
  const pinned = matching.filter((note) => lookOf(note).pinned);
  const here = site
    ? matching.filter(
        (note) => !lookOf(note).pinned && noteSites(note).includes(site.key),
      )
    : [];
  const rest = matching.filter(
    (note) => !pinned.includes(note) && !here.includes(note),
  );

  return (
    <aside className="notes-sidebar" aria-label="All notes">
      <div className="notes-sidebar-head">
        <NotesMark size={18} />
        <span className="notes-sidebar-name">Notes</span>
        <span className="notes-bar-gap" />
        <BarButton label="Hide notes list" onClick={onCollapse}>
          <PanelLeft size={16} />
        </BarButton>
        <BarButton label="New note" onClick={onNew}>
          <Plus size={16} />
        </BarButton>
      </div>
      <label className="notes-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Search notes"
          aria-label="Search notes"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="notes-sidebar-scroll">
        <NoteGroup label="Pinned" notes={pinned} activeId={activeId} />
        {site && (
          <NoteGroup
            label={`On ${site.key}`}
            notes={here}
            activeId={activeId}
          />
        )}
        <NoteGroup
          label={pinned.length || here.length ? 'All notes' : null}
          notes={rest}
          activeId={activeId}
        />
        {!matching.length && (
          <p className="notes-sidebar-empty">
            {q ? `No notes mention “${query}”` : 'No notes yet'}
          </p>
        )}
      </div>
    </aside>
  );
}

function NoteGroup({
  label,
  notes,
  activeId,
}: {
  label: string | null;
  notes: Note[];
  activeId: string | null;
}) {
  const select = useNotes((state) => state.select);
  if (!notes.length) return null;
  return (
    <section className="notes-group">
      {label && <h3 className="notes-group-label">{label}</h3>}
      <ul>
        {notes.map((note) => {
          const { look, markdown } = readFrontMatter(note.body);
          const firstSite = noteSites(note)[0];
          return (
            <li key={note.id}>
              <button
                type="button"
                className="notes-row"
                aria-current={note.id === activeId}
                onClick={() => select(note.id)}
              >
                <span className="notes-row-icon">
                  {look.icon ? (
                    <span aria-hidden>{look.icon}</span>
                  ) : firstSite ? (
                    <SiteIcon
                      url={null}
                      site={`https://${firstSite}`}
                      fallback={<NotesMark size={14} />}
                    />
                  ) : (
                    <NotesMark size={14} />
                  )}
                </span>
                <span className="notes-row-title">{noteTitle(markdown)}</span>
                <span className="notes-row-time">{ago(note.updatedAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Dashes down the right edge, one per heading; hovering lists them. */
function OutlineRail({
  outline,
  active,
  onJump,
}: {
  outline: { level: number; text: string }[];
  active: number;
  onJump: (index: number) => void;
}) {
  const top = Math.min(...outline.map((entry) => entry.level));
  return (
    <nav className="notes-outline-rail" aria-label="On this page">
      <div className="notes-outline-dashes" aria-hidden>
        {outline.map((entry, index) => (
          <span
            key={index}
            data-active={index === active}
            data-depth={entry.level - top}
          />
        ))}
      </div>
      <div className="note-pop notes-outline-list">
        {outline.map((entry, index) => (
          <button
            key={index}
            type="button"
            data-active={index === active}
            style={{ paddingLeft: 10 + (entry.level - top) * 12 }}
            onClick={() => onJump(index)}
          >
            {entry.text}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** The whole note as Markdown, front matter and all. */
function SourceEditor({ note }: { note: Note }) {
  const edit = useNotes((state) => state.edit);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [note.body]);
  return (
    <textarea
      ref={ref}
      autoFocus
      spellCheck={false}
      aria-label="Markdown"
      className="notes-source"
      value={note.body}
      onChange={(event) => edit(note.id, { body: event.target.value })}
    />
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="notes-empty">
      <NotesMark size={36} />
      <h1>Notes</h1>
      <p>
        Pages you write beside your trails. Type{' '}
        <kbd className="note-kbd">/</kbd> for blocks, select text to format it,
        and drag the handle to move things. Notes that link a site show up when
        you visit it.
      </p>
      <button type="button" className="notes-cta" onClick={onCreate}>
        <Plus size={15} aria-hidden /> New note
      </button>
    </div>
  );
}
