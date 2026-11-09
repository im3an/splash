import { AiPanel } from './components/AiPanel';
import { BookmarksBar } from './components/BookmarksBar';
import { ContentArea } from './components/ContentArea';
import { CredentialBar } from './components/CredentialBar';
import { FindBar } from './components/FindBar';
import { PageMenu } from './components/PageMenu';
import { PermissionBar } from './components/PermissionBar';
import { StorageBar } from './components/StorageBar';
import { UnresponsiveBar } from './components/UnresponsiveBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useEffect, useRef } from 'react';
import { useWorkspaceTheme } from './hooks/use-workspace-theme';
import { useInterfacePreferences } from './hooks/use-interface-preferences';
import { useLinkDrop } from './hooks/use-link-drop';
import { useOverlay, type Overlay } from './stores/overlay-store';
import {
  selectAddressInSidebar,
  openLocation,
  selectBlank,
  selectStartPageFocus,
  useShell,
} from './stores/shell-store';

export function App() {
  useWorkspaceTheme();
  useInterfacePreferences();
  useLinkDrop();
  const addressInSidebar = useShell(selectAddressInSidebar);
  // A window or page with nothing in it opens straight into the location
  // field: once per blank page, so dismissing it sticks. Leaving the blank
  // page (another workspace, another page) takes that field with it.
  const blankPage = useShell((state) =>
    selectBlank(state) ? (state.snapshot?.activePageId ?? 'none') : null,
  );
  // With a start page, typing happens in the address field above it.
  const emptyPage = useShell(selectStartPageFocus);
  useEffect(() => {
    if (emptyPage) useShell.getState().focusAddressBar();
  }, [emptyPage]);
  const prompted = useRef<Overlay | null>(null);
  useEffect(() => {
    if (blankPage) {
      if (useOverlay.getState().overlay) return;
      void openLocation().then(() => {
        const { overlay, close } = useOverlay.getState();
        // The blank page may have gone while the field was opening.
        if (selectBlank(useShell.getState())) prompted.current = overlay;
        else if (overlay) close();
      });
      return;
    }
    const { overlay, close } = useOverlay.getState();
    if (overlay && overlay === prompted.current) close();
    prompted.current = null;
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
        <BookmarksBar />
        <StorageBar />
        <UnresponsiveBar />
        <PermissionBar />
        <CredentialBar />
        <FindBar />
        <ContentArea />
      </main>
      <AiPanel />
      <PageMenu />
    </div>
  );
}
