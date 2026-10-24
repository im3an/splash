import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { pageLabel } from '../lib/format';
import { visibleRows, type TrailRow as Row } from '../lib/trail';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { Favicon } from './Favicon';

const INDENT = 14;

export function TrailTree() {
  const snapshot = useShell((state) => state.snapshot);

  if (snapshot === null) return <TrailSkeleton />;

  const rows = visibleRows(snapshot);
  if (rows.length === 0) return <TrailEmpty />;

  return (
    <div role="tree" aria-label="Pages" className="flex flex-col gap-px">
      {rows.map((row) => (
        <TrailRow
          key={row.id}
          row={row}
          active={row.id === snapshot.activePageId}
        />
      ))}
    </div>
  );
}

const TrailRow = memo(function TrailRow({
  row,
  active,
}: {
  row: Row;
  active: boolean;
}) {
  const page = useShell((state) => state.snapshot?.pages[row.id]);
  if (!page) return null;

  const expanded = row.hasChildren ? !page.collapsed : undefined;
  const label = pageLabel(page);

  const activate = () => void api().activatePage(row.id);
  const close = (event: MouseEvent) => {
    event.stopPropagation();
    void api().closePage(row.id);
  };
  const setCollapsed = (collapsed: boolean) =>
    void api().setCollapsed(row.id, collapsed);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    } else if (event.key === 'ArrowLeft' && expanded) {
      setCollapsed(true);
    } else if (event.key === 'ArrowRight' && expanded === false) {
      setCollapsed(false);
    }
  };

  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={active}
      aria-expanded={expanded}
      aria-label={label}
      tabIndex={active ? 0 : -1}
      title={page.url ?? undefined}
      onClick={activate}
      onAuxClick={(event) => event.button === 1 && close(event)}
      onKeyDown={onKeyDown}
      data-active={active}
      className="group relative flex h-[30px] items-center gap-2 rounded-[var(--radius-row)] pr-1 text-fg-muted outline-offset-[-2px] transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg data-[active=true]:bg-elevated data-[active=true]:text-fg data-[active=true]:shadow-[var(--shadow-row)]"
      style={{ paddingLeft: 4 + row.depth * INDENT }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed(!page.collapsed);
          }}
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${label}`}
        title="Close page (⌘W)"
        onClick={close}
        className="grid size-5 shrink-0 place-items-center rounded-[5px] text-fg-subtle opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-data-[active=true]:opacity-100 hover:bg-pressed hover:text-fg"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
});

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
  return (
    <div className="px-3 pt-3 pb-2">
      <p className="text-fg-muted">No pages yet</p>
      <p className="mt-1 text-[12px] leading-[1.45] text-fg-subtle">
        Pages you open appear here, nested under the page they came from.
      </p>
    </div>
  );
}
