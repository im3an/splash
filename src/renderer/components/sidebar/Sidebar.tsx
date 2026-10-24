import { useEffect, useRef, useState } from 'react';
import { Keyboard, Monitor, Moon, PanelLeft, Plus, Sun } from 'lucide-react';
import type { Appearance } from '../../../shared/types';
import { runCommand } from '../../commands/run-command';
import { usePreferences } from '../../stores/preferences-store';
import { useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';
import { Shortcut, withShortcut } from '../common/Shortcut';
import { SidebarSheet } from '../overlays/SidebarSheet';
import { Toasts } from '../overlays/Toasts';
import { TrailTree } from '../tree/TrailTree';
import {
  openWorkspaceMenu,
  WorkspaceHeader,
} from '../workspace/WorkspaceHeader';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';

/**
 * The sidebar also hosts the shell's overlays (sheets, toasts, menus): in
 * the app, anything drawn over the content area would sit beneath the
 * page's Chromium view.
 */
export function Sidebar() {
  const open = usePreferences((state) => state.sidebarOpen);
  const sheetOpen = useUi((state) => state.sheet !== null);

  return (
    <aside
      aria-label="Sidebar"
      aria-hidden={!open}
      inert={!open}
      data-sidebar
      className="relative shrink-0 overflow-hidden transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]"
      style={{ width: open ? 'var(--sidebar-width)' : 0 }}
    >
      <div
        className="flex h-full w-[var(--sidebar-width)] flex-col pl-2"
        inert={sheetOpen}
      >
        <div className="drag flex h-[var(--toolbar-height)] shrink-0 items-center justify-end pr-1">
          <button
            type="button"
            className="icon-button"
            aria-label="Hide sidebar"
            title={withShortcut('Hide sidebar', 'sidebar.toggle')}
            onClick={() => void runCommand('sidebar.toggle')}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
        </div>

        <WorkspaceHeader />

        <button
          type="button"
          onClick={() => void runCommand('page.new')}
          className="mb-1 flex h-[30px] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-2 pl-6 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
        >
          <Plus size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">New page</span>
          <Shortcut command="page.new" />
        </button>

        <div className="mx-2 mb-1 h-px shrink-0 bg-divider" />

        <TreeViewport />

        <footer className="flex h-11 shrink-0 items-center gap-1 border-t border-divider pr-1">
          <WorkspaceSwitcher />
          <div className="flex-1" />
          <AppearanceToggle />
          <button
            type="button"
            className="icon-button size-7 shrink-0"
            aria-label="Keyboard shortcuts"
            title={withShortcut('Keyboard shortcuts', 'help.shortcuts')}
            onClick={() => void runCommand('help.shortcuts')}
          >
            <Keyboard size={15} strokeWidth={1.75} />
          </button>
        </footer>
      </div>

      {open && <Toasts placement="sidebar" />}
      <SidebarSheet />
    </aside>
  );
}

/**
 * The scrolling tree area. Switching workspaces slides the new tree in from
 * the side its dot sits on; right-clicking empty space offers workspace actions.
 */
function TreeViewport() {
  const workspaceId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const index = useShell(
    (state) =>
      state.snapshot?.workspaces.findIndex((w) => w.id === workspaceId) ?? 0,
  );
  const previous = useRef({ id: workspaceId, index });
  const direction =
    previous.current.id === workspaceId
      ? null
      : index >= previous.current.index
        ? 'next'
        : 'previous';
  useEffect(() => {
    previous.current = { id: workspaceId, index };
  }, [workspaceId, index]);

  return (
    <nav
      aria-label="Trail"
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-2"
      onContextMenu={(event) => {
        const onRow = (event.target as HTMLElement).closest('[data-row-id]');
        if (onRow || !workspaceId) return;
        event.preventDefault();
        openWorkspaceMenu(
          workspaceId,
          { x: event.clientX, y: event.clientY },
          null,
        );
      }}
    >
      {/* Keyed by workspace: each tree mounts fresh with its own state. */}
      <TreePane key={workspaceId} direction={direction} />
    </nav>
  );
}

function TreePane({ direction }: { direction: 'next' | 'previous' | null }) {
  // Fixed at mount, so later renders don't cut the entrance short.
  const [entrance] = useState(direction);
  return (
    <div
      data-direction={entrance ?? undefined}
      className={`min-h-full ${entrance ? 'tree-enter' : ''}`}
    >
      <TrailTree />
    </div>
  );
}

const APPEARANCES: Record<
  Appearance,
  { label: string; next: Appearance; Icon: typeof Sun }
> = {
  system: { label: 'System', next: 'light', Icon: Monitor },
  light: { label: 'Light', next: 'dark', Icon: Sun },
  dark: { label: 'Dark', next: 'system', Icon: Moon },
};

function AppearanceToggle() {
  const appearance = usePreferences((state) => state.appearance);
  const { label, next, Icon } = APPEARANCES[appearance];
  return (
    <button
      type="button"
      className="icon-button size-7 shrink-0"
      aria-label={`Appearance: ${label}. Switch to ${APPEARANCES[next].label}`}
      title={`Appearance: ${label}`}
      onClick={() => void runCommand(`appearance.${next}`)}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}
