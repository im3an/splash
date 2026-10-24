import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { BrowserSnapshot, PageId } from '../../../shared/types';
import { attempt } from '../../commands/run-command';
import { dropTarget, type DropPosition } from '../../lib/trail';
import { api } from '../../splash-api';

const MIME = 'application/x-splash-page';

export interface DropState {
  /** `null` is the empty space below the last row. */
  targetId: PageId | null;
  position: DropPosition;
}

export interface RowDragHandlers {
  onDragStart(event: DragEvent, id: PageId): void;
  onDragOver(event: DragEvent, id: PageId | null): void;
  onDrop(event: DragEvent): void;
  onDragEnd(): void;
}

/** Top and bottom quarters insert beside a row; the middle nests inside it. */
function positionIn(event: DragEvent): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  if (ratio < 0.28) return 'before';
  if (ratio > 0.72) return 'after';
  return 'inside';
}

/**
 * Reordering and re-nesting pages by dragging rows. Only drops that would
 * actually move the page are accepted, so the cursor shows when a drop
 * would do nothing.
 */
export function useTreeDrag(snapshot: BrowserSnapshot) {
  const [dragId, setDragId] = useState<PageId | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const dragRef = useRef<PageId | null>(null);
  const dropRef = useRef<DropState | null>(null);

  const handlers = useMemo<RowDragHandlers>(() => {
    const updateDrop = (next: DropState | null) => {
      const current = dropRef.current;
      if (
        current?.targetId === next?.targetId &&
        current?.position === next?.position
      ) {
        return;
      }
      dropRef.current = next;
      setDrop(next);
    };
    const reset = () => {
      dragRef.current = null;
      setDragId(null);
      updateDrop(null);
    };

    return {
      onDragStart(event, id) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(MIME, id);
        dragRef.current = id;
        setDragId(id);
      },
      onDragOver(event, id) {
        const dragged = dragRef.current;
        if (!dragged) return;
        const position = id === null ? 'after' : positionIn(event);
        const target = dropTarget(snapshotRef.current, dragged, id, position);
        if (!target) {
          updateDrop(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        updateDrop({ targetId: id, position });
      },
      onDrop(event) {
        event.preventDefault();
        const dragged = dragRef.current;
        const state = dropRef.current;
        reset();
        if (!dragged || !state) return;
        const target = dropTarget(
          snapshotRef.current,
          dragged,
          state.targetId,
          state.position,
        );
        if (!target) return;
        void attempt(
          () => api().movePage(dragged, target.parentId, target.beforeId),
          'Couldn’t move the page.',
        );
      },
      onDragEnd: reset,
    };
  }, []);

  /** Clears the marker when the pointer leaves the tree altogether. */
  const onTreeDragLeave = (event: DragEvent) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      dropRef.current = null;
      setDrop(null);
    }
  };

  return { dragId, drop, handlers, onTreeDragLeave };
}
