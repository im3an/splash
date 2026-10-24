import { useKeyboardShortcuts } from './commands/use-keyboard-shortcuts';
import { ContentArea } from './components/content/ContentArea';
import { ContextMenu } from './components/overlays/ContextMenu';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toolbar } from './components/toolbar/Toolbar';

export function App() {
  useKeyboardShortcuts();
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <ContentArea />
      </main>
      <ContextMenu />
    </div>
  );
}
