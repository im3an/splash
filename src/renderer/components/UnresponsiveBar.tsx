import { useState } from 'react';
import { Hourglass } from 'lucide-react';
import { hostOf, pageLabel } from '../lib/format';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';

/** Offers a way out when the active page hangs: wait, or reload it. */
export function UnresponsiveBar() {
  const page = useShell(selectActivePage);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  if (!page?.isUnresponsive || waitingFor === page.id) return null;

  const name = page.url ? hostOf(page.url) : pageLabel(page);
  return (
    <div
      role="alertdialog"
      aria-label="Page not responding"
      className="bar-in mx-2 mb-2 flex shrink-0 items-center gap-3 rounded-[var(--radius-control)] bg-elevated py-1.5 pr-1.5 pl-3 shadow-[var(--shadow-row)]"
    >
      <Hourglass
        size={15}
        strokeWidth={1.75}
        className="shrink-0 text-danger"
      />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>
        <span className="text-fg-muted">
          {' '}
          isn’t responding. You can wait, or reload it.
        </span>
      </p>
      <button
        type="button"
        onClick={() => setWaitingFor(page.id)}
        className="h-7 shrink-0 rounded-[6px] px-3 text-fg-muted hover:bg-hover hover:text-fg"
      >
        Wait
      </button>
      <button
        type="button"
        onClick={() => void api().reload(page.id)}
        className="h-7 shrink-0 rounded-[6px] bg-accent px-3 font-medium text-chrome hover:brightness-105"
      >
        Reload
      </button>
    </div>
  );
}
