import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useShell } from '../stores/shell-store';

/** The top of a sidebar panel: back to the trail, a title, its actions. */
export function PanelHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const setPanel = useShell((state) => state.setSidebarPanel);
  // Mirrors the workspace heading it replaces, with back in the icon slot.
  return (
    <div className="mb-0.5 flex h-7 shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setPanel(null)}
        title="Back to pages (esc)"
        className="group flex h-7 min-w-0 items-center gap-1.5 rounded-control pr-2 pl-2.5 text-small font-semibold text-fg transition-colors duration-fast hover:bg-row-hover"
      >
        <span className="grid size-4 shrink-0 place-items-center text-fg-subtle transition-[color,translate] duration-fast group-hover:-translate-x-0.5 group-hover:text-fg">
          <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        </span>
        <h2 className="truncate">{title}</h2>
        <span className="sr-only">, back to pages</span>
      </button>
      <span className="flex-1" />
      {children}
    </div>
  );
}
