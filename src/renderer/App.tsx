import { ContentArea } from './components/ContentArea';
import { FindBar } from './components/FindBar';
import { PermissionBar } from './components/PermissionBar';
import { StorageBar } from './components/StorageBar';
import { UnresponsiveBar } from './components/UnresponsiveBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useEffect } from 'react';
import { useWorkspaceTheme } from './hooks/use-workspace-theme';
import { openLocation, useOverlay } from './stores/overlay-store';
import {
  selectAddressInSidebar,
  selectBlank,
  useShell,
} from './stores/shell-store';

export function App() {
  useWorkspaceTheme();
  const density = useShell((state) => state.preferences?.density);
  const currentPage = useShell((state) => state.preferences?.currentPage);
  const reduceMotion = useShell((state) => state.preferences?.reduceMotion);
  const addressInSidebar = useShell(selectAddressInSidebar);
  useEffect(() => {
    const root = document.documentElement.dataset;
    root.density = density ?? 'comfortable';
    root.currentPage = currentPage ?? 'dot';
    root.motion = reduceMotion ? 'reduced' : 'system';
  }, [density, currentPage, reduceMotion]);
  // A window or page with nothing in it opens straight into the location
  // field: once per blank page, so dismissing it sticks.
  const blankPage = useShell((state) =>
    selectBlank(state) ? (state.snapshot?.activePageId ?? 'none') : null,
  );
  useEffect(() => {
    if (blankPage && !useOverlay.getState().overlay) void openLocation();
  }, [blankPage]);
  return (
    <div className="flex h-full">
      <Sidebar />
      {/* With the toolbar in the sidebar, the page card runs up to the
          window's top edge like Arc's. */}
      <main
        className="flex min-w-0 flex-1 flex-col data-[toolbar=false]:pt-[var(--gutter)]"
        data-toolbar={!addressInSidebar}
      >
        <Toolbar />
        <StorageBar />
        <UnresponsiveBar />
        <PermissionBar />
        <FindBar />
        <ContentArea />
      </main>
    </div>
  );
}
