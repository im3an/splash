import { ShieldQuestion } from 'lucide-react';
import { hostOf, permissionNames } from '../lib/format';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';

/**
 * Asks about a permission the active page wants, right under the address
 * bar. The page keeps running; the answer is remembered for the site.
 */
export function PermissionBar() {
  const page = useShell(selectActivePage);
  const request = page?.permissionRequest;
  if (!page || !request) return null;

  const answer = (granted: boolean) =>
    void api().respondToPermission(page.id, request.id, granted);

  return (
    <div
      role="alertdialog"
      aria-label="Permission request"
      className="bar-in mx-2 mb-2 flex shrink-0 items-center gap-3 rounded-[var(--radius-control)] bg-elevated py-1.5 pr-1.5 pl-3 shadow-[var(--shadow-row)]"
    >
      <ShieldQuestion
        size={15}
        strokeWidth={1.75}
        className="shrink-0 text-accent"
      />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium">{hostOf(request.origin)}</span>
        <span className="text-fg-muted">
          {' '}
          wants to use your {permissionNames(request.permissions)}
        </span>
      </p>
      <span className="hidden shrink-0 text-[12px] text-fg-subtle md:inline">
        Remembered for this site
      </span>
      <button
        type="button"
        onClick={() => answer(false)}
        className="h-7 shrink-0 rounded-[6px] px-3 text-fg-muted hover:bg-hover hover:text-fg"
      >
        Block
      </button>
      <button
        type="button"
        onClick={() => answer(true)}
        className="h-7 shrink-0 rounded-[6px] bg-accent px-3 font-medium text-chrome hover:brightness-105 active:brightness-95"
      >
        Allow
      </button>
    </div>
  );
}
