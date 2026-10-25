import { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen, RotateCw } from 'lucide-react';
import type {
  PermissionDecision,
  SiteInfo,
  SitePermission,
} from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { AnchoredPanel } from './AnchoredPanel';

/** Decided by Splash itself, so a site never asks for them. */
const NEVER_ASKED = new Set<SitePermission>(['sound', 'ads']);

const DECISIONS: { value: PermissionDecision; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'block', label: 'Block' },
];

/** Connection security and this site's permissions, from the address bar. */
export function SiteInfoPopover() {
  const page = useShell(selectActivePage);
  const close = useOverlay((state) => state.close);
  const [info, setInfo] = useState<SiteInfo | null | undefined>(undefined);
  const [changed, setChanged] = useState(false);

  const load = useCallback(async () => {
    setInfo(page ? await api().getSiteInfo(page.id) : null);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const decide = async (
    permission: SitePermission,
    decision: PermissionDecision,
  ) => {
    if (!info) return;
    await api().setSitePermission(info.origin, permission, decision);
    setChanged(true);
    await load();
  };

  const reset = async () => {
    if (!info) return;
    await api().resetSite(info.origin);
    setChanged(true);
    await load();
  };

  return (
    <>
      <div className="absolute inset-0" onMouseDown={close} aria-hidden />
      <AnchoredPanel width={320} label="Site settings">
        {info === undefined ? (
          <div className="h-24" aria-busy="true" />
        ) : info === null ? (
          <p className="p-4 text-fg-muted">This page has no site settings.</p>
        ) : (
          <>
            <div className="flex items-start gap-2.5 border-b border-divider px-4 py-3">
              {info.security === 'secure' ? (
                <Lock
                  size={15}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-fg-muted"
                />
              ) : (
                <LockOpen
                  size={15}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-danger"
                />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{info.host}</p>
                <p className="text-[12px] text-fg-subtle">
                  {info.security === 'secure'
                    ? 'Connection is secure. What you send stays private.'
                    : 'Connection is not secure. Don’t enter passwords or payment details.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 px-2 py-2">
              {info.permissions.map(({ permission, label, decision }) => (
                <div
                  key={permission}
                  className="flex h-9 items-center justify-between gap-3 rounded-[var(--radius-row)] px-2"
                >
                  <span className="min-w-0 text-fg-muted">
                    {label}
                    {permission === 'ads' &&
                      decision === 'block' &&
                      info.blockedCount > 0 && (
                        <span className="block text-[11px] text-fg-subtle">
                          {info.blockedCount} blocked on this page
                        </span>
                      )}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={label}
                    className="flex rounded-[6px] bg-field p-0.5"
                  >
                    {DECISIONS.filter(
                      (option) =>
                        !NEVER_ASKED.has(permission) || option.value !== 'ask',
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={decision === option.value}
                        onClick={() => void decide(permission, option.value)}
                        className="h-6 rounded-[4px] px-2 text-[11px] text-fg-muted transition-colors duration-[var(--duration-fast)] hover:text-fg aria-checked:bg-elevated aria-checked:text-fg aria-checked:shadow-[var(--shadow-row)]"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-divider px-4 py-2.5">
              {changed && page ? (
                <button
                  type="button"
                  onClick={() => {
                    void api().reload(page.id);
                    close();
                  }}
                  className="flex h-7 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[12px] text-fg hover:bg-hover"
                >
                  <RotateCw size={12} strokeWidth={2} />
                  Reload to apply
                </button>
              ) : (
                <span className="text-[12px] text-fg-subtle">
                  Choices apply to all of {info.host}.
                </span>
              )}
              <button
                type="button"
                onClick={() => void reset()}
                className="h-7 rounded-[var(--radius-control)] px-2 text-[12px] text-fg-muted hover:bg-hover hover:text-fg"
              >
                Reset permissions
              </button>
            </div>
          </>
        )}
      </AnchoredPanel>
    </>
  );
}
