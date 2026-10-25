import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ClosedSummary } from '../../shared/types';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';

const VISIBLE_MS = 9000;

/** A brief, quiet offer to bring back what was just closed. */
export function UndoToast() {
  const lastClosed = useShell((state) => state.snapshot?.lastClosed ?? null);
  const [shownSerial, setShownSerial] = useState<number | null>(null);
  const [initialSerial] = useState(() => lastClosed?.serial ?? 0);

  useEffect(() => {
    // Only closes that happen while the shell is open earn a toast.
    if (!lastClosed || lastClosed.serial <= initialSerial) return;
    setShownSerial(lastClosed.serial);
    const timer = setTimeout(() => setShownSerial(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [lastClosed, initialSerial]);

  const visible = lastClosed !== null && shownSerial === lastClosed.serial;
  if (!visible) return null;

  const message = undoMessage(lastClosed);

  return (
    <div
      role="status"
      className="toast-in mx-1 mb-2 flex items-start gap-2 rounded-[var(--radius-control)] bg-elevated py-1.5 pr-1 pl-3 text-[12px] text-fg-muted shadow-[var(--shadow-row)]"
    >
      <span className="min-w-0 flex-1 leading-[1.4]" title={lastClosed.label}>
        {message}
        <span className="text-fg-subtle"> ⇧⌘T also undoes it.</span>
      </span>
      <button
        type="button"
        onClick={() => {
          setShownSerial(null);
          void api().reopenClosed();
        }}
        title="Reopen closed (⇧⌘T)"
        className="flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-2 text-fg transition-colors duration-[var(--duration-fast)] hover:bg-hover"
      >
        <RotateCcw size={12} strokeWidth={2} />
        Undo
      </button>
    </div>
  );
}

const MAX_NAME = 24;

/** Long names are shortened so the count and the shortcut always show. */
function shortName(name: string): string {
  const characters = [...name];
  return characters.length > MAX_NAME
    ? `${characters
        .slice(0, MAX_NAME - 1)
        .join('')
        .trimEnd()}…`
    : name;
}

export function undoMessage(closed: ClosedSummary): string {
  const name = `“${shortName(closed.label)}”`;
  const pages = `${closed.pageCount} page${closed.pageCount === 1 ? '' : 's'}`;
  if (closed.kind === 'workspace') {
    return closed.pageCount > 0
      ? `Deleted workspace ${name} and its ${pages}.`
      : `Deleted workspace ${name}.`;
  }
  return closed.pageCount > 1
    ? `Closed ${name} and ${closed.pageCount - 1} more.`
    : `Closed ${name}.`;
}
