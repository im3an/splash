import type { LucideIcon } from 'lucide-react';

/** Shared hierarchy for a sidebar's empty and recoverable error states. */
export function PanelState({
  icon: Icon,
  title,
  detail,
  action,
  onAction,
  error = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: string;
  onAction?(): void;
  error?: boolean;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-10 text-center"
    >
      <Icon
        size={24}
        strokeWidth={1.5}
        aria-hidden
        className="mb-3 shrink-0 text-fg-subtle"
      />
      <h3 className="text-body font-medium text-fg">{title}</h3>
      <p className="mt-1 max-w-[28ch] text-small leading-relaxed text-fg-muted wrap-anywhere">
        {detail}
      </p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="button button-raised mt-4 text-small"
        >
          {action}
        </button>
      )}
    </div>
  );
}
