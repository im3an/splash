import type { ReactNode } from 'react';
import type { LucideIcon } from '../icons';

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
      <Icon size={24} aria-hidden className="mb-3 shrink-0 text-fg-subtle" />
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

/**
 * The same hierarchy at page scale: what fills the page card (or a whole
 * window) when there's no page to show, a page failed, or the shell broke.
 */
export function PageState({
  lead,
  title,
  detail,
  children,
  role,
}: {
  lead?: ReactNode;
  title?: string;
  detail?: ReactNode;
  children?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className="flex h-full items-center justify-center p-8">
      <div className="max-w-(--measure) text-center">
        {lead && <div className="mb-5 flex justify-center">{lead}</div>}
        {title && (
          <h1 className="text-title font-semibold tracking-[-0.01em] wrap-anywhere">
            {title}
          </h1>
        )}
        {detail && (
          <div className="mt-1.5 leading-copy text-fg-muted">{detail}</div>
        )}
        {children}
      </div>
    </div>
  );
}

/** The row of next steps under a PageState. */
export function PageStateActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-center gap-2">{children}</div>;
}
