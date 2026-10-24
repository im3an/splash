import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { BrowserSnapshot, PageId } from '../../../shared/types';
import { pageMenu } from '../../commands/menus';
import { attempt, runCommand } from '../../commands/run-command';
import { visibleRows } from '../../lib/trail';
import { api } from '../../splash-api';
import { selectActiveWorkspace, useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';
import { INDENT, rowElement, TrailRow } from './TrailRow';
import { useTreeDrag } from './use-tree-drag';

export function TrailTree() {
  const snapshot = useShell((state) => state.snapshot);
  if (snapshot === null) return <TrailSkeleton />;
  if (snapshot.rootIds.length === 0) return <TrailEmpty />;
  return <Tree snapshot={snapshot} />;
}

function rowIdOf(target: EventTarget | null): PageId | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  return target.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
}

function Tree({ snapshot }: { snapshot: BrowserSnapshot }) {
  const rows = useMemo(() => visibleRows(snapshot), [snapshot]);
  const editing = useUi((state) => state.editing);
  const { dragId, drop, handlers, onTreeDragLeave } = useTreeDrag(snapshot);
  const [focusId, setFocusId] = useState<PageId | null>(null);
  /** A row to focus once it exists, e.g. the neighbour of a closed row. */
  const pendingFocus = useRef<PageId | null>(null);
  /** Rows present on the previous render; `null` until the first one. */
  const known = useRef<Set<PageId> | null>(null);

  useEffect(() => {
    known.current = new Set(rows.map((row) => row.id));
    const pending = pendingFocus.current;
    if (pending && rows.some((row) => row.id === pending)) {
      pendingFocus.current = null;
      rowElement(pending)?.focus();
    }
  }, [rows]);

  const has = (id: PageId | null) =>
    id !== null && rows.some((row) => row.id === id);
  const tabStop = has(focusId)
    ? focusId
    : has(snapshot.activePageId)
      ? snapshot.activePageId
      : (rows[0]?.id ?? null);

  const focusRow = (id: PageId | undefined) => {
    if (id) rowElement(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    const id = rowIdOf(event.target);
    const index = rows.findIndex((row) => row.id === id);
    const row = rows[index];
    const page = id ? snapshot.pages[id] : undefined;
    if (!id || !row || !page) return;
    // Modified arrows are move shortcuts; let them through to the commands.
    const modified = event.metaKey || event.altKey || event.ctrlKey;

    switch (event.key) {
      case 'ArrowDown':
        if (modified) return;
        focusRow(rows[index + 1]?.id);
        break;
      case 'ArrowUp':
        if (modified) return;
        focusRow(rows[index - 1]?.id);
        break;
      case 'Home':
        focusRow(rows[0]?.id);
        break;
      case 'End':
        focusRow(rows.at(-1)?.id);
        break;
      case 'ArrowRight':
        if (modified) return;
        if (row.hasChildren && page.collapsed) {
          void attempt(
            () => api().setCollapsed(id, false),
            'Couldn’t update the sidebar.',
          );
        } else if (row.hasChildren) {
          focusRow(rows[index + 1]?.id);
        }
        break;
      case 'ArrowLeft':
        if (modified) return;
        if (row.hasChildren && !page.collapsed) {
          void attempt(
            () => api().setCollapsed(id, true),
            'Couldn’t update the sidebar.',
          );
        } else if (page.parentId) {
          focusRow(page.parentId);
        }
        break;
      case 'Enter':
      case ' ':
        void attempt(() => api().activatePage(id), 'Couldn’t open the page.');
        break;
      case 'Delete':
      case 'Backspace':
        if (modified) return;
        if (event.shiftKey) {
          void runCommand('page.close-tree', { pageId: id });
        } else {
          // Children are promoted into its place, so the next row survives.
          pendingFocus.current =
            (rows[index + 1] ?? rows[index - 1])?.id ?? null;
          void attempt(() => api().closePage(id), 'Couldn’t close the page.');
        }
        break;
      case 'F2':
        void runCommand('page.rename', { pageId: id });
        break;
      case 'ContextMenu':
      case 'F10': {
        if (event.key === 'F10' && !event.shiftKey) return;
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        useUi.getState().openContextMenu({
          x: rect.left + 24,
          y: rect.bottom,
          entries: pageMenu(snapshot, id),
          returnFocus: event.target as HTMLElement,
          viaKeyboard: true,
        });
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      role="tree"
      aria-label="Pages"
      className="flex min-h-full flex-col gap-px"
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const id = rowIdOf(event.target);
        if (id) setFocusId(id);
      }}
      onDragLeave={onTreeDragLeave}
    >
      {rows.map((row) => (
        <TrailRow
          key={row.id}
          row={row}
          active={row.id === snapshot.activePageId}
          tabbable={row.id === tabStop}
          editing={editing?.kind === 'page' && editing.id === row.id}
          isNew={known.current !== null && !known.current.has(row.id)}
          dragging={row.id === dragId}
          drop={drop?.targetId === row.id ? drop.position : null}
          drag={handlers}
        />
      ))}
      {/* Dropping below the last row moves a page to the end of the trail. */}
      <div
        aria-hidden
        className="relative min-h-6 flex-1"
        onDragOver={(event) => handlers.onDragOver(event, null)}
        onDrop={handlers.onDrop}
      >
        {drop?.targetId === null && (
          <span className="drop-line" style={{ left: 24, top: 1 }} />
        )}
      </div>
    </div>
  );
}

function TrailSkeleton() {
  const widths = ['72%', '58%', '64%', '44%'];
  return (
    <div
      aria-busy="true"
      aria-label="Loading pages"
      className="flex flex-col gap-px"
    >
      {widths.map((width, index) => (
        <div
          key={width}
          className="flex h-[30px] items-center gap-2"
          style={{
            paddingLeft: 24 + (index === 1 || index === 2 ? INDENT : 0),
          }}
        >
          <span className="skeleton size-4 shrink-0" />
          <span className="skeleton h-2.5" style={{ width }} />
        </div>
      ))}
    </div>
  );
}

function TrailEmpty() {
  const workspace = useShell(selectActiveWorkspace);
  return (
    <div className="px-3 pt-3 pb-2">
      <p className="text-fg-muted">
        {workspace ? `${workspace.name} has no pages` : 'No pages yet'}
      </p>
      <p className="mt-1 text-[12px] leading-[1.45] text-fg-subtle">
        Pages you open appear here, nested under the page they came from.
      </p>
    </div>
  );
}
