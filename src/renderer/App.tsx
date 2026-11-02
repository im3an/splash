import { AiPanel } from './components/AiPanel';
import { ContentArea } from './components/ContentArea';
import { FindBar } from './components/FindBar';
import { PageMenu } from './components/PageMenu';
import { PermissionBar } from './components/PermissionBar';
import { StorageBar } from './components/StorageBar';
import { UnresponsiveBar } from './components/UnresponsiveBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useEffect } from 'react';
import { useWorkspaceTheme } from './hooks/use-workspace-theme';
import { useInterfacePreferences } from './hooks/use-interface-preferences';
import { openLocation, useOverlay } from './stores/overlay-store';
import {
  selectAddressInSidebar,
  selectBlank,
  useShell,
} from './stores/shell-store';

export function App() {
  useWorkspaceTheme();
  useInterfacePreferences();
  const addressInSidebar = useShell(selectAddressInSidebar);
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
        className="flex min-w-0 flex-1 flex-col data-[toolbar=false]:pt-(--gutter)"
        data-toolbar={!addressInSidebar}
      >
        <Toolbar />
        <StorageBar />
        <UnresponsiveBar />
        <PermissionBar />
        <FindBar />
        <ContentArea />
      </main>
      <AiPanel />
      <PageMenu />
    </div>
  );
}
