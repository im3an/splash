import { useEffect } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { useUi, type Toast } from '../../stores/ui-store';

const DISMISS_AFTER_MS = 5000;

/**
 * Brief feedback, mostly errors. Shown at the foot of the sidebar, or at the
 * top right of the toolbar while the sidebar is hidden, never over the page.
 */
export function Toasts({ placement }: { placement: 'sidebar' | 'toolbar' }) {
  const toasts = useUi((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      className={
        placement === 'sidebar'
          ? 'absolute right-2 bottom-12 left-2 z-10 flex flex-col gap-1.5'
          : 'absolute top-2 right-2 z-10 flex w-[280px] flex-col gap-1.5'
      }
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((state) => state.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      data-no-drag
      className="toast-enter flex min-h-8 items-start gap-2 rounded-[var(--radius-control)] bg-elevated py-1.5 pr-1 pl-2.5 text-[12px] leading-[1.4] shadow-[var(--shadow-popover)]"
    >
      {toast.tone === 'error' && (
        <CircleAlert
          size={13}
          strokeWidth={1.75}
          className="mt-px shrink-0 text-danger"
          aria-hidden
        />
      )}
      <p className="min-w-0 flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        className="icon-button size-5 shrink-0"
        onClick={() => dismiss(toast.id)}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
