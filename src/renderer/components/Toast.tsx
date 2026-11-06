import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { durationMs } from '../lib/motion';
import { useShell } from '../stores/shell-store';
import {
  useToast,
  type Toast as ToastData,
  type ToastAction,
} from '../stores/toast-store';

/**
 * Confirms what just happened and offers the way back. It sits at the foot
 * of the sidebar, or in the toolbar while the sidebar is hidden, so a close
 * never goes unconfirmed.
 */
export function Toast({ placement }: { placement: 'sidebar' | 'toolbar' }) {
  const toast = useToast((state) => state.toast);
  const dismiss = useToast((state) => state.dismiss);
  const hold = useToast((state) => state.hold);
  const sidebarOpen = useShell((state) => state.sidebarOpen);
  const current =
    toast && (placement === 'sidebar') === sidebarOpen ? toast : null;

  // Once dismissed it stays a moment longer, to animate away.
  const last = useRef<ToastData | null>(null);
  if (current) last.current = current;
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (current) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(
      () => setPresent(false),
      durationMs('--duration-exit'),
    );
    return () => clearTimeout(timer);
  }, [current]);

  const shown = current ?? (present ? last.current : null);
  if (!shown) return null;
  return (
    <ToastCard
      toast={shown}
      placement={placement}
      leaving={!current}
      dismiss={dismiss}
      hold={hold}
    />
  );
}

function ToastCard({
  toast,
  placement,
  leaving,
  dismiss,
  hold,
}: {
  toast: ToastData;
  placement: 'sidebar' | 'toolbar';
  leaving: boolean;
  dismiss(id: number): void;
  hold(held: boolean): void;
}) {
  const act = (action: ToastAction) => {
    dismiss(toast.id);
    action.run();
  };
  const compact = placement === 'toolbar';
  // In the narrow sidebar, two buttons beside the message squeeze it into a
  // column; they go on their own row instead.
  const stacked = !compact && toast.actions.length > 1;
  const buttons = toast.actions.map((action) => (
    <button
      key={action.label}
      type="button"
      onClick={() => act(action)}
      title={action.title}
      className="press flex h-6 shrink-0 items-center gap-1 rounded-inner px-2 text-fg hover:bg-hover"
    >
      {action.icon === 'undo' && <RotateCcw size={12} />}
      {action.icon === 'redo' && <RotateCw size={12} />}
      {action.label}
    </button>
  ));

  return (
    <div
      key={toast.id}
      // On its way out it's no longer news, so it stops being announced.
      role={leaving ? undefined : 'status'}
      aria-hidden={leaving || undefined}
      inert={leaving}
      data-leaving={leaving}
      onPointerEnter={() => hold(true)}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) hold(false);
      }}
      onFocus={() => hold(true)}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !event.currentTarget.matches(':hover')
        )
          hold(false);
      }}
      data-placement={placement}
      className={
        compact
          ? 'toast-in ml-1.5 flex h-7 max-w-(--notice-width) min-w-0 shrink items-center gap-1 rounded-control bg-elevated pr-0.5 pl-3 text-small text-fg-muted shadow-row'
          : `toast-in mx-1 mb-2 flex gap-2 rounded-control bg-elevated py-1.5 pr-1 pl-3 text-small text-fg-muted shadow-row ${stacked ? 'flex-col gap-1' : 'items-start'}`
      }
    >
      <span
        className={
          compact
            ? 'min-w-0 flex-1 truncate'
            : `min-w-0 flex-1 leading-copy ${stacked ? 'pt-0.5 pr-2' : ''}`
        }
        title={toast.detail ? `${toast.message} ${toast.detail}` : undefined}
      >
        {toast.message}
        {toast.detail && !compact && (
          <span className="text-fg-subtle"> {toast.detail}</span>
        )}
      </span>
      {stacked ? (
        <div className="-ml-2 flex justify-end gap-0.5">{buttons}</div>
      ) : (
        buttons
      )}
    </div>
  );
}
