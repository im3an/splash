import { useEffect, useState } from 'react';
import { DatabaseZap } from 'lucide-react';
import type { StorageStatus } from '../../shared/types';
import { api } from '../splash-api';

/** Shown while saving keeps failing, so the user isn't surprised later. */
export function StorageBar() {
  const [status, setStatus] = useState<StorageStatus>({ problem: null });

  useEffect(() => {
    void api().storageStatus().then(setStatus);
    return api().onStorageStatus(setStatus);
  }, []);

  if (!status.problem) return null;
  return (
    <div
      role="status"
      className="bar-in mx-2 mb-2 flex shrink-0 items-center gap-3 rounded-[var(--radius-control)] bg-elevated px-3 py-2 shadow-[var(--shadow-row)]"
    >
      <DatabaseZap
        size={15}
        strokeWidth={1.75}
        className="shrink-0 text-danger"
      />
      <p className="min-w-0 flex-1 text-[12px] leading-[1.45]">
        <span className="font-medium">
          Splash can’t save your trails right now
        </span>
        <span className="text-fg-muted">
          {' '}
          ({status.problem}). It keeps trying; nothing is lost while Splash
          stays open.
        </span>
      </p>
    </div>
  );
}
