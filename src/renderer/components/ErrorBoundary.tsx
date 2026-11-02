import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrandMark } from './Brand';
import { PageState, PageStateActions } from './PanelState';

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
    <PageState
      role="alert"
      lead={<BrandMark size={24} className="text-fg-subtle" />}
      title="This window ran into a problem"
      detail="Your workspaces and pages are safe. Reloading the window brings it back."
    >
      <PageStateActions>
        <button
          type="button"
          onClick={() => location.reload()}
          className="button button-raised button-lg"
        >
          Reload window
        </button>
      </PageStateActions>
    </PageState>
  );
}
