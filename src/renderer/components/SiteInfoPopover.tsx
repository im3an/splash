import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Lock, LockOpen, RotateCw } from 'lucide-react';
import type {
  PermissionDecision,
  SiteInfo,
  SitePermission,
} from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { AnchoredPanel } from './AnchoredPanel';
import { PanelState } from './PanelState';
import { SegmentedControl } from './SegmentedControl';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pageId = page?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      setInfo(pageId ? await api().getSiteInfo(pageId) : null);
    } catch {
      setError('Couldn’t load site settings. Try again.');
    }
  }, [pageId]);

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
    if (!info || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api().setSitePermission(info.origin, permission, decision);
      setChanged(true);
      await load();
    } catch {
      setError('Couldn’t change this permission. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!info || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api().resetSite(info.origin);
      setChanged(true);
      await load();
    } catch {
      setError('Couldn’t reset permissions. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="absolute inset-0" onMouseDown={close} aria-hidden />
      <AnchoredPanel width={340} label="Site settings" modal>
        {info === undefined && error ? (
          <PanelState
            icon={CircleAlert}
            title="Site settings unavailable"
            detail={error}
            action="Try again"
            onAction={() => void load()}
            error
          />
        ) : info === undefined ? (
          <div
            role="status"
            aria-label="Loading site settings"
            aria-busy="true"
            className="space-y-3 p-4"
          >
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-2/3" />
            <span className="sr-only">Loading site settings…</span>
          </div>
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
                <p className="text-small text-fg-subtle">
                  {info.security === 'secure'
                    ? 'Your connection to this site is encrypted.'
                    : 'Connection is not secure. Don’t enter passwords or payment details.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 px-2 py-2">
              {info.permissions.map(({ permission, label, decision }) => (
                <div
                  key={permission}
                  className="flex h-9 items-center justify-between gap-3 rounded-row px-2"
                >
                  <span className="min-w-0 text-fg-muted">
                    {label}
                    {permission === 'ads' &&
                      decision === 'block' &&
                      info.blockedCount > 0 && (
                        <span className="block text-caption text-fg-subtle">
                          {info.blockedCount} blocked on this page
                        </span>
                      )}
                  </span>
                  <SegmentedControl
                    compact
                    label={label}
                    value={decision}
                    disabled={busy}
                    options={DECISIONS.filter(
                      (option) =>
                        !NEVER_ASKED.has(permission) || option.value !== 'ask',
                    )}
                    onChange={(value) => void decide(permission, value)}
                  />
                </div>
              ))}
            </div>
            {error && (
              <p
                role="alert"
                className="px-4 pb-2 text-small leading-relaxed text-danger"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-4 py-2.5">
              {changed && page ? (
                <button
                  type="button"
                  onClick={() => {
                    void api().reload(page.id);
                    close();
                  }}
                  className="button button-sm text-fg"
                >
                  <RotateCw size={12} strokeWidth={2} />
                  Reload to apply
                </button>
              ) : (
                <span className="text-small text-fg-subtle">
                  Choices apply to all of {info.host}.
                </span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void reset()}
                className="button button-sm"
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
