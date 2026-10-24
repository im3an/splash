import { useRef } from 'react';
import type { PageId } from '../../shared/types';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

/** A page's note beneath its row: a quiet preview, or an editor. */
export function PageNote({
  pageId,
  depth,
  indent,
}: {
  pageId: PageId;
  depth: number;
  indent: number;
}) {
  const note = useShell((state) => state.snapshot?.pages[pageId]?.note ?? null);
  const editing = useShell((state) => state.editingNotePageId === pageId);
  const active = useShell((state) => state.snapshot?.activePageId === pageId);
  const editNote = useShell((state) => state.editNote);
  const settled = useRef(false);
  const inset = { marginLeft: 4 + depth * indent + 24 };

  if (editing) {
    settled.current = false;
    const commit = (value: string) => {
      if (settled.current) return;
      settled.current = true;
      editNote(null);
      if (value.trim() !== (note ?? '')) {
        void api().setNote(pageId, value.trim() || null);
      }
    };
    return (
      <textarea
        autoFocus
        defaultValue={note ?? ''}
        aria-label="Page note"
        placeholder="Add a note…"
        maxLength={4000}
        rows={3}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            settled.current = true;
            editNote(null);
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            commit(event.currentTarget.value);
          }
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        style={inset}
        className="mr-1 mb-1 resize-none rounded-[var(--radius-control)] bg-field-focus px-2 py-1.5 text-[12px] leading-[1.45] text-fg shadow-[0_0_0_1px_var(--hairline),0_0_0_3px_var(--accent-soft)] outline-none placeholder:text-fg-subtle select-text"
      />
    );
  }

  if (!note || !active) return null;
  return (
    <button
      type="button"
      onClick={() => editNote(pageId)}
      title="Edit note"
      style={inset}
      className="mr-1 mb-1 line-clamp-2 rounded-[5px] px-1.5 py-0.5 text-left text-[12px] leading-[1.4] text-fg-subtle transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg-muted"
    >
      {note}
    </button>
  );
}
