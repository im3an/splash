import { useEffect, useRef } from 'react';
import { ArrowRight, Command, Globe, History, Search } from 'lucide-react';
import type { PaletteItem } from '../../shared/types';

function ItemIcon({ item }: { item: PaletteItem }) {
  const className = 'shrink-0 text-fg-subtle';
  switch (item.kind) {
    case 'page':
      return item.faviconUrl ? (
        <img
          src={item.faviconUrl}
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          className="size-4 shrink-0 rounded-[3px] object-contain"
        />
      ) : (
        <Globe size={15} strokeWidth={1.75} className={className} />
      );
    case 'history':
      return <History size={15} strokeWidth={1.75} className={className} />;
    case 'navigate':
      return item.title.startsWith('Search') ? (
        <Search size={15} strokeWidth={1.75} className={className} />
      ) : (
        <ArrowRight size={15} strokeWidth={1.75} className={className} />
      );
    case 'command':
      return <Command size={15} strokeWidth={1.75} className={className} />;
  }
}

/** The result list shared by the command palette and address suggestions. */
export function PaletteList({
  items,
  selected,
  onSelect,
  onRun,
  emptyLabel,
}: {
  items: PaletteItem[];
  selected: number;
  onSelect(index: number): void;
  onRun(item: PaletteItem): void;
  emptyLabel: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (items.length === 0) {
    return emptyLabel ? (
      <p className="px-3 py-6 text-center text-[13px] text-fg-subtle">
        {emptyLabel}
      </p>
    ) : null;
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Results"
      className="flex max-h-[min(420px,60vh)] flex-col gap-px overflow-y-auto p-1.5"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          role="option"
          aria-selected={index === selected}
          onMouseMove={() => index !== selected && onSelect(index)}
          onMouseDown={(event) => {
            // Keep focus in the field; act on click.
            event.preventDefault();
            onRun(item);
          }}
          className="flex h-9 items-center gap-2.5 rounded-[var(--radius-row)] px-2.5 aria-selected:bg-hover"
        >
          <ItemIcon item={item} />
          <span className="min-w-0 flex-1 truncate text-fg">{item.title}</span>
          <span className="max-w-[45%] shrink-0 truncate text-[12px] text-fg-subtle">
            {item.kind === 'page' && item.workspaceName
              ? `${item.workspaceName} · ${item.subtitle}`
              : item.kind === 'page'
                ? `Switch to · ${item.subtitle}`
                : item.subtitle}
          </span>
          {item.kind === 'command' && item.shortcut && (
            <kbd className="shrink-0 font-sans text-[11px] text-fg-subtle">
              {item.shortcut}
            </kbd>
          )}
        </div>
      ))}
    </div>
  );
}
