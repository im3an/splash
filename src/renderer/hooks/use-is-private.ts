import { useEffect, useState } from 'react';
import { api } from '../splash-api';

/** Whether this window is a private one. It never changes once it's open. */
export function useIsPrivate(): boolean {
  const [isPrivate, setPrivate] = useState(false);
  useEffect(() => {
    let current = true;
    void api()
      .windowInfo?.()
      .then((info) => {
        if (current) setPrivate(info.isPrivate);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return isPrivate;
}
