import { useEffect, useState } from 'react';
import { DatabaseZap } from 'lucide-react';
import type { StorageStatus } from '../../shared/types';
import { api } from '../splash-api';
import { Reveal } from './Reveal';

/** Shown while saving keeps failing, so the user isn't surprised later. */
export function StorageBar() {
  const [status, setStatus] = useState<StorageStatus>({ problem: null });

  useEffect(() => {
    void api().storageStatus().then(setStatus);
    return api().onStorageStatus(setStatus);
  }, []);

  return (
    <Reveal show={status.problem !== null}>
      <div role="status" className="shell-bar py-2 pr-3">
        <DatabaseZap
          size={15}
          strokeWidth={1.75}
          className="shrink-0 text-danger"
        />
        <p className="min-w-0 flex-1 text-small leading-copy">
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
    </Reveal>
  );
}
