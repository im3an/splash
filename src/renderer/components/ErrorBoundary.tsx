import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Shown instead of the children once they have thrown. */
  fallback(reset: () => void): ReactNode;
  onError?(error: unknown): void;
  children: ReactNode;
}

/**
 * Keeps a failure in one part of the shell from unmounting all of it.
 * Trails live in the main process, so nothing is lost when a part resets.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Shell error', error, info.componentStack);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ failed: false });

  override render() {
    return this.state.failed
      ? this.props.fallback(this.reset)
      : this.props.children;
  }
}

/** The last resort: the whole window failed to render. */
export function ShellCrashed() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[360px] text-center">
        <h1 className="text-title font-semibold">
          This window ran into a problem
        </h1>
        <p className="mt-1.5 text-fg-muted">
          Your workspaces and pages are safe. Reloading the window brings it
          back.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-5 h-8 rounded-[var(--radius-control)] bg-elevated px-3 shadow-[var(--shadow-row)] hover:bg-field-focus"
        >
          Reload window
        </button>
      </div>
    </div>
  );
}
