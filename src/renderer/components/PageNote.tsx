import { useRef } from 'react';
import type { PageId } from '../../shared/types';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

/** A page's note beneath its row: a quiet preview, or an editor. */
export function PageNote({
  pageId,
  depth,
  indent,
  lead,
}: {
  pageId: PageId;
  depth: number;
  indent: number;
  /** Where a top-level row's favicon starts. */
  lead: number;
}) {
  const note = useShell((state) => state.snapshot?.pages[pageId]?.note ?? null);
  const editing = useShell((state) => state.editingNotePageId === pageId);
  const active = useShell((state) => state.snapshot?.activePageId === pageId);
  const editNote = useShell((state) => state.editNote);
  const settled = useRef(false);
  const inset = { marginLeft: lead + depth * indent };

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
        className="editing-field mr-1 mb-1 resize-none rounded-control px-2 py-1.5 text-small leading-copy text-fg placeholder:text-fg-subtle select-text"
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
      className="mr-1 mb-1 line-clamp-2 rounded-inner px-1.5 py-0.5 text-left text-small leading-copy text-fg-subtle transition-colors duration-fast hover:bg-hover hover:text-fg-muted"
    >
      {note}
    </button>
  );
}
