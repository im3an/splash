import { ContentArea } from './components/ContentArea';
import { FindBar } from './components/FindBar';
import { PermissionBar } from './components/PermissionBar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useWorkspaceTheme } from './hooks/use-workspace-theme';

export function App() {
  useWorkspaceTheme();
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <PermissionBar />
        <FindBar />
        <ContentArea />
      </main>
    </div>
  );
}
