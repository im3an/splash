import { ContentArea } from './components/ContentArea';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';

export function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <ContentArea />
      </main>
    </div>
  );
}
