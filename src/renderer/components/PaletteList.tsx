import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Columns2,
  Copy,
  CornerDownRight,
  Download,
  FolderPlus,
  Globe,
  History,
  Link,
  ListX,
  Palette,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  RotateCw,
  Scaling,
  Search,
  Settings,
  SlidersHorizontal,
  StickyNote,
  TextSearch,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { accentColors } from '../../shared/appearance';
import type {
  PaletteCommand,
  PaletteItem,
  PaletteSection,
} from '../../shared/types';
import { highlightParts } from '../lib/highlight';
import { WorkspaceIcon } from './WorkspaceIcon';

const COMMAND_ICONS: Record<PaletteCommand, LucideIcon> = {
  'new-page': Plus,
  'new-child-page': CornerDownRight,
  'new-workspace': FolderPlus,
  'customize-workspace': Palette,
  'reopen-closed': RotateCcw,
  'close-page': X,
  'close-branch': ListX,
  'toggle-sidebar': PanelLeft,
  'toggle-split': Columns2,
  find: TextSearch,
  reload: RotateCw,
  'duplicate-page': Copy,
  'copy-link': Link,
  'rename-page': Pencil,
  'edit-note': StickyNote,
  'mute-page': Volume2,
  'pin-page': Pin,
  'site-info': SlidersHorizontal,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  'zoom-reset': Scaling,
  'show-downloads': Download,
  'show-history': History,
  'open-settings': Settings,
};

const SECTION_LABELS: Record<PaletteSection, string | null> = {
  go: null,
  pinned: 'Pinned',
  pages: 'Pages',
  workspaces: 'Workspaces',
  commands: 'Commands',
  history: 'History',
  search: 'Suggestions',
};

/** A site's favicon, or `fallback` when there is none or it won't load. */
function SiteIcon({
  url,
  fallback,
}: {
  url: string | null | undefined;
  fallback: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl) return fallback;
  return (
    <img
      src={url}
      alt=""
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      draggable={false}
      className="size-4 shrink-0 rounded-[var(--radius-mark)] object-contain"
      onError={() => setFailedUrl(url)}
    />
  );
}

function ItemIcon({ item }: { item: PaletteItem }) {
  const className = 'shrink-0 text-fg-subtle';
  const props = { size: 15, strokeWidth: 1.75, className, 'aria-hidden': true };
  switch (item.kind) {
    case 'page':
      return <SiteIcon url={item.faviconUrl} fallback={<Globe {...props} />} />;
    case 'workspace': {
      const { light, dark } = accentColors(item.appearance.accent);
      const style: CSSProperties = { color: `light-dark(${light}, ${dark})` };
      return (
        <span
          className="grid size-4 shrink-0 place-items-center text-small font-medium"
          style={style}
        >
          <WorkspaceIcon
            icon={item.appearance.icon}
            name={item.title}
            size={14}
          />
        </span>
      );
    }
    case 'history':
      return (
        <SiteIcon url={item.faviconUrl} fallback={<History {...props} />} />
      );
    case 'search':
      return <Search {...props} />;
    case 'navigate':
      return item.title.startsWith('Search') ? (
        <Search {...props} />
      ) : (
        <SiteIcon url={item.faviconUrl} fallback={<ArrowRight {...props} />} />
      );
    case 'command': {
      // Toggles show what they will do: a struck pin to unpin.
      const Icon =
        item.command === 'pin-page' && item.title.startsWith('Unpin')
          ? PinOff
          : item.command === 'mute-page' && item.title.startsWith('Unmute')
            ? VolumeX
            : COMMAND_ICONS[item.command];
      return <Icon {...props} />;
    }
  }
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return highlightParts(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="bg-transparent font-semibold text-fg">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

/** Grouped by section, keeping each row's place in the flat list. */
function groupsOf(items: PaletteItem[]) {
  const groups: {
    section: PaletteSection;
    rows: { item: PaletteItem; index: number }[];
  }[] = [];
  items.forEach((item, index) => {
    const last = groups.at(-1);
    if (last?.section === item.section) last.rows.push({ item, index });
    else groups.push({ section: item.section, rows: [{ item, index }] });
  });
  return groups;
}

/** The result list shared by the command palette and address suggestions. */
export function PaletteList({
  items,
  selected,
  onSelect,
  onRun,
  emptyLabel,
  query = '',
  sectioned = false,
}: {
  items: PaletteItem[];
  selected: number;
  onSelect(index: number): void;
  onRun(item: PaletteItem): void;
  emptyLabel: string | null;
  /** Words to mark in titles. */
  query?: string;
  /** Show section headers (the palette) or one plain list (suggestions). */
  sectioned?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, items]);

  if (items.length === 0) {
    return emptyLabel ? (
      <p className="px-3 py-6 text-center text-body text-fg-subtle">
        {emptyLabel}
      </p>
    ) : null;
  }

  const row = ({ item, index }: { item: PaletteItem; index: number }) => {
    // After the title: where the row leads. Commands show their shortcut.
    const detail = item.kind === 'command' ? null : item.subtitle;
    const shortcut =
      item.kind === 'command' || item.kind === 'workspace'
        ? item.shortcut
        : null;
    return (
      <div
        key={item.id}
        id={`palette-${index}`}
        role="option"
        aria-selected={index === selected}
        onMouseMove={() => index !== selected && onSelect(index)}
        onMouseDown={(event) => {
          // Keep focus in the field; act on click.
          event.preventDefault();
          onRun(item);
        }}
        className="flex h-9 shrink-0 cursor-default items-center gap-2.5 rounded-[var(--radius-row)] px-2.5 text-fg-muted transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] aria-selected:bg-hover aria-selected:text-fg"
      >
        <ItemIcon item={item} />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-fg">
            <Highlighted text={item.title} query={query} />
          </span>
          {detail && (
            <span className="ml-2 text-small text-fg-subtle">{detail}</span>
          )}
        </span>
        {item.kind === 'page' && item.workspaceName && (
          <span className="max-w-[35%] shrink-0 truncate text-small text-fg-subtle">
            in {item.workspaceName}
          </span>
        )}
        {shortcut && (
          <kbd className="shrink-0 font-sans text-caption text-fg-subtle tabular-nums">
            {shortcut}
          </kbd>
        )}
      </div>
    );
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Results"
      className="flex max-h-[min(440px,60vh)] flex-col overflow-y-auto p-1.5"
    >
      {sectioned
        ? groupsOf(items).map(({ section, rows }, groupIndex) => {
            const label = SECTION_LABELS[section];
            return (
              <div
                key={`${section}-${groupIndex}`}
                role="group"
                aria-label={label ?? undefined}
                className="flex flex-col gap-px not-first:mt-1.5"
              >
                {label && (
                  <div
                    aria-hidden
                    className="px-2.5 pt-1 pb-0.5 text-caption font-medium text-fg-subtle"
                  >
                    {label}
                  </div>
                )}
                {rows.map(row)}
              </div>
            );
          })
        : items.map((item, index) => row({ item, index }))}
    </div>
  );
}
