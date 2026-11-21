import { useEffect, useState } from 'react';
import { Hourglass } from '../icons';
import { hostOf, pageLabel } from '../lib/format';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';
import { Reveal } from './Reveal';

/** Offers a way out when the active page hangs: wait, or reload it. */
export function UnresponsiveBar() {
  const page = useShell(selectActivePage);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const stillHung = useShell((state) =>
    waitingFor ? state.snapshot?.pages[waitingFor]?.isUnresponsive : false,
  );
  // Wait is for this hang. If the page hangs again later, ask again.
  useEffect(() => {
    if (!stillHung) setWaitingFor(null);
  }, [stillHung]);
  const show = !!page?.isUnresponsive && waitingFor !== page.id;
  if (!show || !page) return <Reveal show={false}>{null}</Reveal>;

  const name = page.url ? hostOf(page.url) : pageLabel(page);
  return (
    <Reveal show>
      <div
        role="alertdialog"
        aria-label="Page not responding"
        className="shell-bar"
      >
        <Hourglass size={15} className="shrink-0 text-danger" />
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
          className="button"
        >
          Wait
        </button>
        <button
          type="button"
          onClick={() => void api().reload(page.id)}
          className="button button-primary"
        >
          Reload
        </button>
      </div>
    </Reveal>
  );
}
