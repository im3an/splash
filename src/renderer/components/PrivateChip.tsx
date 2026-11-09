import { EyeOff } from 'lucide-react';
import { useIsPrivate } from '../hooks/use-is-private';

/** Says, in every private window, that nothing here is kept and what still is. */
export function PrivateChip() {
  const isPrivate = useIsPrivate();
  if (!isPrivate) return null;
  return (
    <span
      className="private-chip"
      title="Pages, history, cookies and new logins in this window are forgotten when you close it. Downloads and bookmarks you add stay."
    >
      <EyeOff size={13} aria-hidden />
      Private
    </span>
  );
}
