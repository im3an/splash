import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, PanelLeft, RotateCw, X } from 'lucide-react';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';
import { AddressBar } from './AddressBar';

export function Toolbar() {
  const page = useShell(selectActivePage);
  const sidebarOpen = useShell((state) => state.sidebarOpen);
  const toggleSidebar = useShell((state) => state.toggleSidebar);

  const hasContent = Boolean(page?.url);

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
      <div className="ml-1.5 flex min-w-0 flex-1">
        <AddressBar />
      </div>
    </header>
  );
}

function ToolbarButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled?: boolean;
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
      onClick={onClick}
    >
      {children}
    </button>
  );
}
