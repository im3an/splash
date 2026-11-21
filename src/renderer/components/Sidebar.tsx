import { useEffect, useLayoutEffect, useRef } from 'react';
import { FolderPlus, PanelLeft, Plus } from '../icons';
import { api } from '../splash-api';
import { useLinkDrag } from '../stores/drag-store';
import { openLocation } from '../stores/shell-store';
import {
  selectAddressInSidebar,
  selectFlatTrail,
  useShell,
} from '../stores/shell-store';
import { installTitleMarquee } from '../lib/title-marquee';
import { endSidebarPeek } from '../hooks/use-sidebar-peek';
import { useOverlay } from '../stores/overlay-store';
import { SidebarResize } from './SidebarResize';
import { AddressBar } from './AddressBar';
import { DownloadsButton } from './DownloadsButton';
import { ExtensionActions } from './ExtensionActions';
import { PageMenuButton } from './PageMenuButton';
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
  const overTrail = useLinkDrag((state) => state.opening?.kind === 'trail');
  // The trail slides back in after a panel, but not when the window opens.
  const leftForPanel = useRef(false);
  if (panel) leftForPanel.current = true;
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  // Shut, it can still come out over the page from the window's left edge.
  const peek = useShell((state) => state.sidebarPeek);
  const peekLeaving = useOverlay(
    (state) => state.overlay?.kind === 'sidebar-peek' && state.leaving,
  );
  const floating = !open && (peek || peekLeaving);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  // Only while open: the toolbar has the address field while this is shut.
  const addressHere = useShell(selectAddressInSidebar);
  const downloadsPinned = useShell((state) =>
    state.preferences?.toolbarActions.includes('downloads'),
  );
  const workspaceId = useShell((state) => state.snapshot?.activeWorkspaceId);
  // Switching workspaces slides the trail the way the foot's order goes.
  const slide = useWorkspaceSlide();
  const flat = useShell(selectFlatTrail);
  const listRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  // Long page titles scroll into view on hover.
  useEffect(() => {
    const aside = asideRef.current;
    return aside ? installTitleMarquee(aside) : undefined;
  }, []);
  const scrollPositions = useRef(new Map<string, number>());

  // Each workspace keeps its own scroll position in the trail.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !workspaceId) return;
    const positions = scrollPositions.current;
    list.scrollTop = positions.get(workspaceId) ?? 0;
    // Kept as it moves: by the time this effect cleans up, the next workspace's
    // rows are in place, and a shorter list has already pulled the scroll back.
    const remember = () => positions.set(workspaceId, list.scrollTop);
    list.addEventListener('scroll', remember, { passive: true });
    return () => list.removeEventListener('scroll', remember);
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
      ref={asideRef}
      aria-label="Sidebar"
      aria-hidden={!open && !floating}
      inert={!open && !floating}
      data-leaving={peekLeaving}
      className={
        floating
          ? 'sidebar-peek frame-backdrop fixed inset-y-0 left-0 z-40 overflow-hidden pr-(--gutter)'
          : 'relative shrink-0 overflow-hidden transition-[width] duration-slow ease-emphasized'
      }
      style={{
        width: floating ? `calc(${width} + var(--gutter))` : open ? width : 0,
      }}
      onMouseEnter={() => window.clearTimeout(leaveTimer.current)}
      onMouseLeave={(event) => {
        if (!floating) return;
        // Past the window's own edge doesn't count: that's where it came from.
        if (event.clientX <= 0) return;
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = window.setTimeout(endSidebarPeek, 250);
      }}
    >
      {/* Keeps its width while the sidebar closes, so nothing reflows. */}
      <div
        className="sidebar-column flex h-full flex-col pl-(--gutter) transition-[width] duration-slow ease-emphasized"
        // Rows line their icons up past the chevrons, when the trail has any.
        data-flat={flat}
        style={{ width }}
      >
        {addressHere ? (
          <>
            {/* Like Arc's: the sidebar toggle by the window controls, the
                page's way back and forward at the other end. */}
            <div className="drag relative flex h-(--toolbar-height) shrink-0 items-center gap-0.5 pl-[calc(var(--traffic-lights)-var(--gutter))]">
              <button
                type="button"
                className="icon-button shrink-0"
                aria-label={open ? 'Hide sidebar' : 'Keep sidebar open'}
                title={open ? 'Hide sidebar (⌘S)' : 'Keep sidebar open (⌘S)'}
                onClick={toggleSidebar}
              >
                <PanelLeft size={16} />
              </button>
              <span className="flex-1" />
              {!downloadsPinned && <DownloadsButton />}
              <NavigationButtons />
              {/* Laid over the page's back and forward while it shows, where
                  it sat at the end of the toolbar. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 left-[calc(var(--traffic-lights)-var(--gutter)+var(--control-height)+4px)] flex items-center justify-end *:pointer-events-auto">
                <Toast placement="sidebar-top" />
              </div>
            </div>
            <div className="mb-2 shrink-0">
              <AddressBar
                variant="sidebar"
                trailing={
                  <>
                    <ExtensionActions buttonsOnly />
                    <PageMenuButton />
                  </>
                }
              />
            </div>
          </>
        ) : (
          /* Power-user row: every tool one click away, beside the window controls. */
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
              title="New blank page"
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
        )}

        {/* Stays mounted under a panel, keeping its scroll position. */}
        <div
          className={`${panel ? 'hidden' : 'flex'} ${leftForPanel.current ? 'trail-in' : ''} min-h-0 flex-1 flex-col`}
        >
          <TrailFilter />
          {/* Padded so the active row's edge is never clipped by the scroller. */}
          <nav
            ref={listRef}
            data-link-drop="trail"
            data-over={overTrail}
            className="link-drop-trail min-h-0 flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-px pb-2"
          >
            <SavedGroups />
            <div key={workspaceId} className={slide}>
              {/* The top row has no room for it with the address bar here. */}
              <TrailTree
                newPage={
                  addressHere ? (
                    <button
                      type="button"
                      onClick={newPage}
                      className="sidebar-new-page sidebar-row"
                    >
                      {/* In the favicon column, wherever that is. */}
                      <span className="grid size-4 shrink-0 place-items-center">
                        <Plus size={15} />
                      </span>
                      <span className="flex-1 text-left">New page</span>
                      <kbd className="shortcut">⌘T</kbd>
                    </button>
                  ) : undefined
                }
              />
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
