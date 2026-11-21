import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  PanelLeft,
  RotateCw,
  X,
} from '../icons';
import { api } from '../splash-api';
import {
  selectActivePage,
  selectAddressInSidebar,
  selectBarless,
  selectBlank,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { AddressBar } from './AddressBar';
import { ToolbarActions } from './ToolbarActions';
import { Toast } from './Toast';

/**
 * Back, address and page controls over the page. With the Address bar
 * setting on Sidebar they live at the sidebar's top instead, like Arc,
 * whenever it's open.
 */
export function Toolbar() {
  const sidebarOpen = useShell((state) => state.sidebarOpen);
  const addressInSidebar = useShell(selectAddressInSidebar);
  const barless = useShell(selectBarless);
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  // With nothing to browse, the palette is all there is; the strip stays so
  // the window can still be dragged.
  const blank = useShell(selectBlank);

  if (addressInSidebar || barless) return null;

  return (
    <header
      className="drag flex h-(--toolbar-height) shrink-0 items-center gap-0.5 pr-2 transition-[padding] duration-base ease-out"
      style={{
        paddingLeft: sidebarOpen ? 'var(--gutter)' : 'var(--traffic-lights)',
      }}
    >
      {!sidebarOpen && (
        <ToolbarButton
          label="Show sidebar"
          shortcut="⌘S"
          onClick={toggleSidebar}
        >
          <PanelLeft size={16} />
        </ToolbarButton>
      )}
      {!blank && (
        <div className="bar-in flex min-w-0 flex-1 items-center gap-0.5">
          <NavigationButtons />
          <div className="mx-1.5 flex min-w-0 flex-1">
            <AddressBar />
          </div>
          <ToolbarActions />
        </div>
      )}
      {blank && (
        <>
          <span className="flex-1" />
          <ToolbarActions />
        </>
      )}
      {/* With the sidebar hidden, its feedback moves up here. */}
      <Toast placement="toolbar" />
    </header>
  );
}

/** Back, forward, and reload or stop for the page in front. */
export function NavigationButtons() {
  const page = useShell(selectActivePage);
  return (
    <>
      <ToolbarButton
        label="Back"
        shortcut="⌘["
        disabled={!page?.canGoBack}
        onClick={() => page && void api().goBack(page.id)}
      >
        <ArrowLeft size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="Forward"
        shortcut="⌘]"
        disabled={!page?.canGoForward}
        onClick={() => page && void api().goForward(page.id)}
      >
        <ArrowRight size={16} />
      </ToolbarButton>
      {page?.isLoading ? (
        <ToolbarButton
          label="Stop"
          shortcut="⌘."
          onClick={() => void api().stop(page.id)}
        >
          <X size={16} />
        </ToolbarButton>
      ) : (
        <ToolbarButton
          label="Reload"
          shortcut="⌘R"
          disabled={!page?.url}
          onClick={() => page && void api().reload(page.id)}
        >
          <RotateCw size={16} />
        </ToolbarButton>
      )}
    </>
  );
}

/** Opens or closes split view with the page's parent or child. */
export function SplitButton({ compact }: { compact?: boolean }) {
  const page = useShell(selectActivePage);
  const splitOpen = useShell((state) => selectVisibleSplit(state) !== null);
  const label = splitOpen
    ? 'Close split view'
    : page?.parentId
      ? 'Compare with parent'
      : 'Compare with child';
  return (
    <ToolbarButton
      label={label}
      shortcut={'⌘\\'}
      pressed={splitOpen}
      compact={compact}
      disabled={
        !page || (!splitOpen && !page.parentId && !page.childIds.length)
      }
      onClick={() => page && void api().toggleSplit(page.id)}
    >
      <Columns2 size={compact ? 14 : 16} />
    </ToolbarButton>
  );
}

function ToolbarButton({
  label,
  shortcut,
  disabled,
  pressed,
  compact,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled?: boolean;
  /** For toggles: whether the thing it controls is on. */
  pressed?: boolean;
  /** Sized to sit inside the address pill. */
  compact?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={compact ? 'icon-button size-7' : 'icon-button'}
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
