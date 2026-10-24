import { memo, useState, type MouseEvent } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { PAGE_TITLE_MAX } from '../../../shared/ipc';
import { pageMenu } from '../../commands/menus';
import { attempt, runCommand } from '../../commands/run-command';
import { pageLabel } from '../../lib/format';
import type { TrailRow as Row } from '../../lib/trail';
import { api } from '../../splash-api';
import { useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';
import { Favicon } from '../common/Favicon';
import { InlineEdit } from '../common/InlineEdit';
import { withShortcut } from '../common/Shortcut';
import type { DropState, RowDragHandlers } from './use-tree-drag';

export const INDENT = 14;
const ROW_PADDING = 4;

export function rowElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-row-id="${CSS.escape(id)}"]`,
  );
}

/**
 * Focuses a row once React has rendered it (e.g. after an inline edit),
 * unless something else has taken focus in the meantime.
 */
export function focusRowSoon(id: string): void {
  requestAnimationFrame(() => {
    const current = document.activeElement;
    if (current && current !== document.body) return;
    rowElement(id)?.focus();
  });
}

export const TrailRow = memo(function TrailRow({
  row,
  active,
  tabbable,
  editing,
  isNew,
  dragging,
  drop,
  drag,
}: {
  row: Row;
  active: boolean;
  tabbable: boolean;
  editing: boolean;
  /** Appeared after the tree first rendered (created, or revealed by expanding). */
  isNew: boolean;
  dragging: boolean;
  drop: DropState['position'] | null;
  drag: RowDragHandlers;
}) {
  const page = useShell((state) => state.snapshot?.pages[row.id]);
  // Decided once: a row animates in only when it first mounts as new.
  const [enter] = useState(isNew);
  if (!page) return null;

  const expanded = row.hasChildren ? !page.collapsed : undefined;
  const label = pageLabel(page);

  const activate = () =>
    void attempt(() => api().activatePage(row.id), 'Couldn’t open the page.');
  const close = (event: MouseEvent) => {
    event.stopPropagation();
    void attempt(() => api().closePage(row.id), 'Couldn’t close the page.');
  };
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    void attempt(
      () => api().setCollapsed(row.id, !page.collapsed),
      'Couldn’t update the sidebar.',
    );
  };

  const commitRename = (value: string) => {
    useUi.getState().stopEditing();
    const trimmed = value.trim();
    // Clearing the name, or typing the page's own title, removes the custom name.
    const next =
      trimmed === '' || trimmed === page.title.trim() ? null : trimmed;
    if (next !== page.customTitle) {
      void attempt(
        () => api().renamePage(row.id, next),
        'Couldn’t rename the page.',
      );
    }
    focusRowSoon(row.id);
  };
  const cancelRename = () => {
    useUi.getState().stopEditing();
    focusRowSoon(row.id);
  };

  const openMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const snapshot = useShell.getState().snapshot;
    if (!snapshot) return;
    useUi.getState().openContextMenu({
      x: event.clientX,
      y: event.clientY,
      entries: pageMenu(snapshot, row.id),
      returnFocus: event.currentTarget,
    });
  };

  // A drop "after" an expanded page lands as its first child, so mark it there.
  const dropDepth = drop === 'after' && expanded ? row.depth + 1 : row.depth;

  return (
    <div
      role="treeitem"
      data-row-id={row.id}
      aria-level={row.depth + 1}
      aria-selected={active}
      aria-expanded={expanded}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      title={page.url ?? undefined}
      draggable={!editing}
      onClick={editing ? undefined : activate}
      onDoubleClick={() => void runCommand('page.rename', { pageId: row.id })}
      onAuxClick={(event) => event.button === 1 && close(event)}
      onContextMenu={openMenu}
      onDragStart={(event) => drag.onDragStart(event, row.id)}
      onDragOver={(event) => drag.onDragOver(event, row.id)}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      data-active={active}
      data-drop={drop === 'inside' ? 'inside' : undefined}
      className={`group relative flex h-[30px] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-1 text-fg-muted outline-offset-[-2px] transition-[background-color,color,opacity] duration-[var(--duration-fast)] hover:bg-hover hover:text-fg data-[active=true]:bg-elevated data-[active=true]:text-fg data-[active=true]:shadow-[var(--shadow-row)] data-[drop=inside]:bg-accent-soft data-[drop=inside]:text-fg ${dragging ? 'opacity-45' : ''} ${enter ? 'row-enter' : ''}`}
      style={{ paddingLeft: ROW_PADDING + row.depth * INDENT }}
    >
      {(drop === 'before' || drop === 'after') && (
        <span
          className="drop-line"
          style={{
            left: ROW_PADDING + dropDepth * INDENT + 24,
            [drop === 'before' ? 'top' : 'bottom']: -1.5,
          }}
        />
      )}
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={toggle}
          onDoubleClick={(event) => event.stopPropagation()}
          className="grid size-4 shrink-0 place-items-center rounded-[4px] text-fg-subtle hover:bg-pressed hover:text-fg"
        >
          <ChevronRight
            size={12}
            strokeWidth={2}
            className="transition-transform duration-[var(--duration-fast)] ease-out"
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <Favicon page={page} />
      {editing ? (
        <InlineEdit
          initial={label}
          label="Page name"
          maxLength={PAGE_TITLE_MAX}
          onCommit={commitRename}
          onCancel={cancelRename}
          className="-ml-1.5"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
      {!editing && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${label}`}
          title={withShortcut('Close page', 'page.close')}
          onClick={close}
          onDoubleClick={(event) => event.stopPropagation()}
          className="grid size-5 shrink-0 place-items-center rounded-[5px] text-fg-subtle opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:bg-pressed hover:text-fg"
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
});
