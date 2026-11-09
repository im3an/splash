import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ChevronsDownUp,
  ClipboardPaste,
  CodeXml,
  Columns2,
  Copy,
  CornerDownRight,
  Download,
  EyeOff,
  FileDown,
  FileInput,
  FileOutput,
  FileText,
  FolderPlus,
  Globe,
  Hash,
  History,
  House,
  KeyRound,
  Layers,
  Link,
  ListEnd,
  ListFilter,
  ListMinus,
  ListPlus,
  ListX,
  Network,
  Palette,
  PanelLeft,
  Pencil,
  PictureInPicture2,
  Pin,
  PinOff,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Scaling,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareTerminal,
  Star,
  StickyNote,
  TextSearch,
  Trash2,
  Type,
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
import { SiteIcon } from './Favicon';

const COMMAND_ICONS: Record<PaletteCommand, LucideIcon> = {
  'open-file': FileText,
  'new-private-window': EyeOff,
  'manage-passwords': KeyRound,
  'import-data': FileInput,
  'export-bookmarks': FileOutput,
  'export-trail': FileOutput,
  'picture-in-picture': PictureInPicture2,
  'new-page': Plus,
  'new-child-page': CornerDownRight,
  'new-sibling-page': ListPlus,
  'collapse-other-trails': ChevronsDownUp,
  'show-trail-summary': History,
  'import-trail': FileInput,
  'paste-outline': ClipboardPaste,
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
  'copy-markdown': Hash,
  'copy-text': Type,
  'paste-and-go': ClipboardPaste,
  'go-home': House,
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
  'show-bookmarks': Star,
  'show-tasks': Activity,
  'show-alma-view': Network,
  'toggle-bookmarks-bar': Star,
  'bookmark-branch': Star,
  'open-settings': Settings,
  'go-back': ArrowLeft,
  'go-forward': ArrowRight,
  print: Printer,
  'save-page': FileDown,
  'close-others': ListMinus,
  'close-below': ListEnd,
  'view-source': CodeXml,
  'dev-tools': SquareTerminal,
  'filter-pages': ListFilter,
  'toggle-ai-panel': Sparkles,
  'close-split': Square,
  'rename-workspace': Pencil,
  'delete-workspace': Trash2,
};

const SECTION_LABELS: Record<PaletteSection, string | null> = {
  go: null,
  pinned: 'Pinned',
  pages: 'Pages',
  workspaces: 'Workspaces',
  commands: 'Commands',
  bookmarks: 'Bookmarks',
  history: 'History',
  search: 'Suggestions',
};

function ItemIcon({ item }: { item: PaletteItem }) {
  // Brightens with its row when picked.
  const className =
    'shrink-0 text-fg-subtle transition-colors duration-fast group-aria-selected/option:text-fg-muted';
  const props = { size: 15, className, 'aria-hidden': true };
  switch (item.kind) {
    case 'page':
      return <SiteIcon url={item.faviconUrl} fallback={<Globe {...props} />} />;
    case 'workspace': {
      const { light, dark } = accentColors(item.appearance.accent);
      const style: CSSProperties = { color: `light-dark(${light}, ${dark})` };
      // The same mark for all, in each workspace's own accent.
      return (
        <Layers size={15} aria-hidden className="shrink-0" style={style} />
      );
    }
    case 'history':
      return (
        <SiteIcon
          url={item.faviconUrl}
          site={item.url}
          fallback={<History {...props} />}
        />
      );
    case 'bookmark':
      return (
        <SiteIcon
          url={item.faviconUrl}
          site={item.url}
          fallback={<Star {...props} />}
        />
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

/**
 * A row's second line: where it leads. Commands have none; the group
 * names them.
 */
function detailOf(item: PaletteItem): string | null {
  switch (item.kind) {
    case 'command':
      return null;
    case 'page':
      return item.workspaceName
        ? `${item.subtitle} · in ${item.workspaceName}`
        : item.subtitle;
    case 'workspace':
      return `Workspace · ${item.subtitle}`;
    case 'search':
      return item.subtitle || 'Search suggestion';
    default:
      return item.subtitle || null;
  }
}

/** `text` with the words of `query` marked. */
export function Highlighted({ text, query }: { text: string; query: string }) {
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
  emptyHint,
  query = '',
  sectioned = false,
  actionOf,
}: {
  items: PaletteItem[];
  selected: number;
  onSelect(index: number): void;
  onRun(item: PaletteItem): void;
  emptyLabel: string | null;
  /** What to try instead, under the empty label. */
  emptyHint?: string | null;
  /** Words to mark in titles. */
  query?: string;
  /** Show section headers (the palette) or one plain list (suggestions). */
  sectioned?: boolean;
  /** What Return does with a row, shown on the selected one. */
  actionOf?(item: PaletteItem): string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, items]);

  if (items.length === 0) {
    return emptyLabel ? (
      <div role="status" className="px-4 py-7 text-center">
        <p className="text-body text-fg-muted">{emptyLabel}</p>
        {emptyHint && (
          <p className="mt-1 text-small text-fg-subtle">{emptyHint}</p>
        )}
      </div>
    ) : null;
  }

  const row = ({ item, index }: { item: PaletteItem; index: number }) => {
    const detail = detailOf(item);
    const shortcut =
      item.kind === 'command' || item.kind === 'workspace'
        ? item.shortcut
        : null;
    const action = index === selected ? actionOf?.(item) : null;
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
        className={`group/option flex shrink-0 cursor-default items-center gap-3 rounded-row px-2.5 text-fg-muted transition-colors duration-fast ease-out aria-selected:bg-option-selected aria-selected:text-fg ${detail ? 'h-11' : 'h-9'}`}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <ItemIcon item={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-fg">
            <Highlighted text={item.title} query={query} />
          </span>
          {detail && (
            <span className="truncate text-small text-fg-subtle group-aria-selected/option:text-fg-muted">
              {detail}
            </span>
          )}
        </span>
        {shortcut && (
          <kbd className="shortcut group-aria-selected/option:text-fg-muted">
            {shortcut}
          </kbd>
        )}
        {action && (
          <span className="palette-action flex max-w-[40%] shrink-0 items-center gap-1.5 text-caption text-fg-muted">
            <kbd className="keycap" aria-hidden>
              ↵
            </kbd>
            <span className="truncate">{action}</span>
          </span>
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
                className="flex flex-col gap-px not-first:mt-2"
              >
                {label && (
                  <div
                    aria-hidden
                    className="px-2.5 pt-1 pb-1 text-caption font-medium tracking-[0.02em] text-fg-subtle"
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
