import { ContentArea } from './components/ContentArea';
import { FindBar } from './components/FindBar';
import { PermissionBar } from './components/PermissionBar';
import { StorageBar } from './components/StorageBar';
import { UnresponsiveBar } from './components/UnresponsiveBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useEffect } from 'react';
import { useWorkspaceTheme } from './hooks/use-workspace-theme';
import { useShell } from './stores/shell-store';

export function App() {
  useWorkspaceTheme();
  const density = useShell((state) => state.preferences?.density);
  useEffect(() => {
    document.documentElement.dataset.density = density ?? 'comfortable';
  }, [density]);
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
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
