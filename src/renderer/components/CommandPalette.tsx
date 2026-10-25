import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { PaletteItem } from '../../shared/types';
import { runPaletteItem } from '../lib/run-palette-item';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { PaletteList } from './PaletteList';

/** ⌘K: jump to any page in any workspace, revisit history, run commands. */
export function CommandPalette() {
  const close = useOverlay((state) => state.close);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let current = true;
    void api()
      .queryPalette(query, 'palette')
      .then((results) => {
        if (!current) return;
        setItems(results);
        setSelected(0);
      });
    return () => {
      current = false;
    };
  }, [query]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="overlay-in absolute inset-0 flex justify-center bg-[rgb(0_0_0/0.14)] px-6 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex h-fit w-[560px] max-w-full flex-col overflow-hidden rounded-[12px] bg-elevated shadow-[0_0_0_0.5px_var(--hairline),0_18px_48px_rgb(0_0_0/0.22)]">
        <div className="flex h-12 items-center gap-2.5 border-b border-divider px-3.5">
          <Search
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-fg-subtle"
          />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((index) => Math.min(items.length - 1, index + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const item = items[selected];
                if (item) void runPaletteItem(item, 'palette');
              }
            }}
            placeholder="Search pages, history and commands"
            aria-label="Search pages, history and commands"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle select-text"
          />
          <kbd className="shrink-0 font-sans text-[11px] text-fg-subtle">
            esc
          </kbd>
        </div>
        <PaletteList
          items={items}
          selected={selected}
          onSelect={setSelected}
          onRun={(item) => void runPaletteItem(item, 'palette')}
          emptyLabel={query.trim() ? `Nothing matches “${query.trim()}”` : null}
        />
      </div>
    </div>
  );
}
