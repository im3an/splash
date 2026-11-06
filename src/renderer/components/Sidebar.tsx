import { useLayoutEffect, useRef } from 'react';
import { FolderPlus, PanelLeft, Plus } from 'lucide-react';
import { api } from '../splash-api';
import { openLocation } from '../stores/shell-store';
import {
  selectAddressInSidebar,
  selectFlatTrail,
  useShell,
} from '../stores/shell-store';
import { SidebarResize } from './SidebarResize';
import { AddressBar } from './AddressBar';
import { ToolbarActions } from './ToolbarActions';
import { SavedGroups, useGroupRename } from './SavedGroups';
import { SidebarPanel } from './SidebarPanel';
import { NavigationButtons } from './Toolbar';
import { TrailFilter } from './TrailFilter';
import { TrailTree } from './TrailTree';
import { Toast } from './Toast';
import { WorkspaceBar } from './WorkspaceBar';
import { useWorkspaceSlide } from '../lib/use-workspace-slide';

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
  // Switching workspaces slides the trail the way the foot's order goes.
  const slide = useWorkspaceSlide();
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

  const newGroup = async () => {
    const id = await api().createGroup();
    // Named in place, like any other group.
    useGroupRename.setState({ id });
  };

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
      className="relative shrink-0 overflow-hidden transition-[width] duration-slow ease-emphasized"
      style={{ width: open ? width : 0 }}
    >
      {/* Keeps its width while the sidebar closes, so nothing reflows. */}
      <div
        className="sidebar-column flex h-full flex-col pl-(--gutter) transition-[width] duration-slow ease-emphasized"
        // Rows line their icons up past the chevrons, when the trail has any.
        data-flat={flat}
        style={{ width }}
      >
        {/* Power-user row: every tool one click away, beside the window controls. */}
        <div className="drag flex h-(--toolbar-height) shrink-0 items-center gap-0.5 pl-[calc(var(--traffic-lights)-var(--gutter))]">
          <span className="flex-1" />
          <button
            type="button"
            onClick={newGroup}
            aria-label="New group"
            title="New group"
            className="icon-button shrink-0"
          >
            <FolderPlus size={16} />
          </button>
          <button
            type="button"
            onClick={newPage}
            aria-label="New page"
            title="New page (⌘T)"
            className="icon-button shrink-0"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="icon-button shrink-0"
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘S)"
            onClick={toggleSidebar}
          >
            <PanelLeft size={16} />
          </button>
        </div>

        {addressHere && (
          <div className="mb-2 flex shrink-0 flex-col gap-1">
            <div className="flex items-center gap-0.5">
              <NavigationButtons />
              <span className="flex-1" />
              <ToolbarActions />
            </div>
            <AddressBar variant="sidebar" />
          </div>
        )}

        {/* Stays mounted under a panel, keeping its scroll position. */}
        <div
          className={`${panel ? 'hidden' : 'flex'} ${leftForPanel.current ? 'trail-in' : ''} min-h-0 flex-1 flex-col`}
        >
          <TrailFilter />
          {/* Padded so the active row's edge is never clipped by the scroller. */}
          <nav
            ref={listRef}
            className="min-h-0 flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-px pb-2"
          >
            <SavedGroups />
            <div key={workspaceId} className={slide}>
              <TrailTree />
            </div>
          </nav>
        </div>
        {panel && <SidebarPanel key={panel} panel={panel} />}
        <Toast placement="sidebar" />
        <WorkspaceBar />
      </div>
      {open && !panel && <SidebarResize />}
    </aside>
  );
}
