import { useLayoutEffect, useRef } from 'react';
import { PanelLeft, Plus } from 'lucide-react';
import { api } from '../splash-api';
import { openLocation } from '../stores/overlay-store';
import {
  selectAddressInSidebar,
  selectFlatTrail,
  useShell,
} from '../stores/shell-store';
import { AddressBar } from './AddressBar';
import { ExtensionActions } from './ExtensionActions';
import { SidebarPanel } from './SidebarPanel';
import { NavigationButtons, SplitButton } from './Toolbar';
import { TrailTree } from './TrailTree';
import { Toast } from './Toast';
import { WorkspaceBar } from './WorkspaceBar';
import { WorkspaceButton } from './WorkspaceButton';

/**
 * Arc's layout: window controls on top (with navigation and the address
 * pill when the Address bar setting puts them here), the workspace's name
 * over its trail, and workspaces along the foot.
 */
export function Sidebar() {
  const open = useShell((state) => state.sidebarOpen);
  const panel = useShell((state) => state.sidebarPanel);
  // The trail slides back in after a panel, but not when the window opens.
  const leftForPanel = useRef(false);
  if (panel) leftForPanel.current = true;
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  // Only while open: the toolbar has the address field while this is shut.
  const addressHere = useShell(selectAddressInSidebar);
  const workspaceId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const workspaceIndex = useShell(
    (state) =>
      state.snapshot?.workspaces.findIndex(
        (w) => w.id === state.snapshot?.activeWorkspaceId,
      ) ?? -1,
  );
  // Switching workspaces slides the trail the way the foot's order goes.
  const previousIndex = useRef(workspaceIndex);
  const slide = useRef('');
  if (previousIndex.current !== workspaceIndex) {
    slide.current =
      previousIndex.current === -1
        ? ''
        : workspaceIndex > previousIndex.current
          ? 'slide-from-right'
          : 'slide-from-left';
    previousIndex.current = workspaceIndex;
  }
  const flat = useShell(selectFlatTrail);
  const listRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef(new Map<string, number>());

  // Each workspace keeps its own scroll position in the trail.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !workspaceId) return;
    list.scrollTop = scrollPositions.current.get(workspaceId) ?? 0;
    const positions = scrollPositions.current;
    return () => {
      positions.set(workspaceId, list.scrollTop);
    };
  }, [workspaceId]);

  const newPage = async () => {
    await api().createPage();
    void openLocation();
  };

  // Downloads and History get more room than the trail.
  const width = panel ? 'var(--sidebar-width-wide)' : 'var(--sidebar-width)';

  return (
    <aside
      aria-label="Sidebar"
      aria-hidden={!open}
      inert={!open}
      className="shrink-0 overflow-hidden transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-emphasized)]"
      style={{ width: open ? width : 0 }}
    >
      {/* Keeps its width while the sidebar closes, so nothing reflows. */}
      <div
        className="flex h-full flex-col pl-[var(--gutter)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-emphasized)]"
        style={{ width }}
      >
        <div className="drag flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 pl-[calc(var(--traffic-lights)-var(--gutter))]">
          {/* Without navigation beside it, the toggle sits by the page. */}
          {!addressHere && <span className="flex-1" />}
          <button
            type="button"
            className="icon-button"
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘S)"
            onClick={toggleSidebar}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
          </button>
          {addressHere && (
            <>
              <span className="flex-1" />
              <NavigationButtons />
            </>
          )}
        </div>

        {addressHere && (
          <div className="mb-3 flex shrink-0">
            <AddressBar
              variant="sidebar"
              trailing={
                <>
                  <ExtensionActions />
                  <SplitButton compact />
                </>
              }
            />
          </div>
        )}

        {/* Stays mounted under a panel, keeping its scroll position. */}
        <div
          className={`${panel ? 'hidden' : 'flex'} ${leftForPanel.current ? 'trail-in' : ''} min-h-0 flex-1 flex-col`}
        >
          <div
            key={workspaceId}
            className={`flex shrink-0 flex-col ${slide.current}`}
          >
            <WorkspaceButton />
          </div>

          <button
            type="button"
            onClick={newPage}
            data-flat={flat}
            className="mb-px flex h-[var(--row-height)] shrink-0 items-center gap-2 rounded-[var(--radius-row)] pr-2 pl-[30px] text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-row-hover hover:text-fg active:bg-row-pressed data-[flat=true]:pl-2.5"
          >
            {/* Sits in the favicon column of a top-level row, wherever that is. */}
            <span className="grid size-4 shrink-0 place-items-center">
              <Plus size={15} strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-left">New page</span>
            <kbd className="font-sans text-caption text-fg-subtle">⌘T</kbd>
          </button>

          {/* Padded so the active row's edge is never clipped by the scroller. */}
          <nav
            ref={listRef}
            className="min-h-0 flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-px pb-2"
          >
            <div key={workspaceId} className={slide.current}>
              <TrailTree />
            </div>
          </nav>
        </div>
        {panel && <SidebarPanel key={panel} panel={panel} />}
        <Toast placement="sidebar" />
        <WorkspaceBar />
      </div>
    </aside>
  );
}
