import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, PanelLeft, RotateCw, X } from 'lucide-react';
import type { CommandId } from '../../../shared/commands';
import { runCommand } from '../../commands/run-command';
import { usePreferences } from '../../stores/preferences-store';
import { selectActivePage, useShell } from '../../stores/shell-store';
import { withShortcut } from '../common/Shortcut';
import { Toasts } from '../overlays/Toasts';
import { AddressBar } from './AddressBar';

export function Toolbar() {
  const page = useShell(selectActivePage);
  const sidebarOpen = usePreferences((state) => state.sidebarOpen);

  return (
    <header
      className="drag relative flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 pr-2 transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-out)]"
      style={{ paddingLeft: sidebarOpen ? 8 : 'var(--traffic-lights)' }}
    >
      {!sidebarOpen && (
        <ToolbarButton label="Show sidebar" command="sidebar.toggle">
          <PanelLeft size={16} strokeWidth={1.75} />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="Back"
        command="nav.back"
        disabled={!page?.canGoBack}
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        label="Forward"
        command="nav.forward"
        disabled={!page?.canGoForward}
      >
        <ArrowRight size={16} strokeWidth={1.75} />
      </ToolbarButton>
      {page?.isLoading ? (
        <ToolbarButton label="Stop" command="nav.stop">
          <X size={16} strokeWidth={1.75} />
        </ToolbarButton>
      ) : (
        <ToolbarButton
          label="Reload"
          command="nav.reload"
          disabled={!page?.url}
        >
          <RotateCw size={15} strokeWidth={1.75} />
        </ToolbarButton>
      )}
      <div className="ml-1.5 flex min-w-0 flex-1">
        <AddressBar />
      </div>
      {!sidebarOpen && <Toasts placement="toolbar" />}
    </header>
  );
}

function ToolbarButton({
  label,
  command,
  disabled,
  children,
}: {
  label: string;
  command: CommandId;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={withShortcut(label, command)}
      disabled={disabled}
      onClick={() => void runCommand(command)}
    >
      {children}
    </button>
  );
}
