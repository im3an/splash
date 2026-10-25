import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  PanelLeft,
  RotateCw,
  X,
} from 'lucide-react';
import { api } from '../splash-api';
import {
  selectActivePage,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { AddressBar } from './AddressBar';

export function Toolbar() {
  const page = useShell(selectActivePage);
  const sidebarOpen = useShell((state) => state.sidebarOpen);
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  const splitOpen = useShell((state) => selectVisibleSplit(state) !== null);

  const hasContent = Boolean(page?.url);
  const splitLabel = splitOpen
    ? 'Close split view'
    : page?.parentId
      ? 'Compare with parent'
      : 'Compare with child';

  return (
    <header
      className="drag flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 pr-2 transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-out)]"
      style={{ paddingLeft: sidebarOpen ? 8 : 'var(--traffic-lights)' }}
    >
      {!sidebarOpen && (
        <ToolbarButton
          label="Show sidebar"
          shortcut="⌘S"
          onClick={toggleSidebar}
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="Back"
        shortcut="⌘["
        disabled={!page?.canGoBack}
        onClick={() => page && void api().goBack(page.id)}
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        label="Forward"
        shortcut="⌘]"
        disabled={!page?.canGoForward}
        onClick={() => page && void api().goForward(page.id)}
      >
        <ArrowRight size={16} strokeWidth={1.75} />
      </ToolbarButton>
      {page?.isLoading ? (
        <ToolbarButton
          label="Stop"
          shortcut="⌘."
          onClick={() => void api().stop(page.id)}
        >
          <X size={16} strokeWidth={1.75} />
        </ToolbarButton>
      ) : (
        <ToolbarButton
          label="Reload"
          shortcut="⌘R"
          disabled={!hasContent}
          onClick={() => page && void api().reload(page.id)}
        >
          <RotateCw size={15} strokeWidth={1.75} />
        </ToolbarButton>
      )}
      <div className="mx-1.5 flex min-w-0 flex-1">
        <AddressBar />
      </div>
      <ToolbarButton
        label={splitLabel}
        shortcut="⌘\\"
        pressed={splitOpen}
        disabled={
          !page || (!splitOpen && !page.parentId && !page.childIds.length)
        }
        onClick={() => page && void api().toggleSplit(page.id)}
      >
        <Columns2 size={16} strokeWidth={1.75} />
      </ToolbarButton>
    </header>
  );
}

function ToolbarButton({
  label,
  shortcut,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled?: boolean;
  /** For toggles: whether the thing it controls is on. */
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
