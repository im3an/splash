import { useRef, type MouseEvent } from 'react';
import { create } from 'zustand';
import {
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import {
  collectionNotice,
  openGroup,
  openGroupRoot,
  updateLibrary,
} from '../lib/collections';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import type { MenuEntry } from './ContextMenu';
import { SiteIcon } from './Favicon';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The group whose name is being edited in place, if any. */
export const useGroupRename = create<{ id: string | null }>()(() => ({
  id: null,
}));

/**
 * Trails put away for later. Each is one row: click it to open the trail
 * again (or show it, when it's already open); the chevron peeks inside.
 */
export function SavedGroups() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const groups = collections.filter((item) => item.kind === 'group');
  const menu = useSidebarMenu('Saved group');
  if (!groups.length) return null;

  return (
    <details className="trail-section" aria-label="Saved groups" open>
      <summary className="sidebar-section-heading">
        <span className="sidebar-section-label">
          Saved
          <ChevronRight size={12} />
          <span className="sidebar-folded-count">{groups.length}</span>
        </span>
      </summary>
      <div className="sidebar-section-content flex flex-col gap-px">
        {groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            menuOpen={menu.openOn?.dataset.group === group.id}
            onMenu={(event, anchored) =>
              menu.show(event, groupEntries(group), anchored)
            }
          />
        ))}
      </div>
      {menu.element}
    </details>
  );
}

function GroupRow({
  group,
  menuOpen,
  onMenu,
}: {
  group: SavedCollection;
  menuOpen: boolean;
  onMenu(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
}) {
  const renaming = useGroupRename((state) => state.id === group.id);
  // Its trail is open in this workspace: clicking shows it, not a copy.
  const isOpen = useShell((state) =>
    state.snapshot ? openGroupRoot(state.snapshot, group) !== null : false,
  );
  const count = group.links.length;
  const pages = `${count} ${count === 1 ? 'page' : 'pages'}`;

  return (
    <div
      className="sidebar-row group"
      data-menu-open={menuOpen}
      data-open={isOpen}
      onContextMenu={(event) => onMenu(event)}
    >
      {renaming ? (
        <span className="sidebar-row-main">
          <StackedIcons links={group.links} />
          <GroupNameField group={group} />
        </span>
      ) : (
        <button
          type="button"
          className="sidebar-row-main"
          aria-label={`${group.name}, ${pages}${isOpen ? ', open' : ''}`}
          // The pages inside, so the row needn't open to be recognised.
          title={[
            `${isOpen ? 'Show' : 'Open'} ${group.name} (${pages})`,
            ...group.links
              .slice(0, 8)
              .map((link) => `· ${link.title || link.url}`),
            count > 8 ? `and ${count - 8} more` : '',
          ]
            .filter(Boolean)
            .join('\n')}
          onClick={() => void openGroup(group)}
          onDoubleClick={(event) => {
            event.preventDefault();
            useGroupRename.setState({ id: group.id });
          }}
        >
          <StackedIcons links={group.links} />
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          <span className="sidebar-row-count">{count}</span>
        </button>
      )}
      {!renaming && (
        <button
          type="button"
          data-group={group.id}
          aria-label={`Actions for ${group.name}`}
          title="Group actions"
          aria-haspopup="menu"
          onClick={(event) => onMenu(event, true)}
          className="sidebar-row-more"
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

/** Up to three of the group's site icons, fanned like a stack of cards. */
function StackedIcons({ links }: { links: SavedCollection['links'] }) {
  const shown = links.slice(0, 3);
  return (
    <span className="stacked-icons" aria-hidden data-count={shown.length}>
      {shown.map((link) => (
        <span key={link.id} className="stacked-icon">
          <SiteIcon url={link.faviconUrl} />
        </span>
      ))}
    </span>
  );
}

function GroupNameField({ group }: { group: SavedCollection }) {
  const settled = useRef(false);
  const commit = (value: string) => {
    if (settled.current) return;
    settled.current = true;
    useGroupRename.setState({ id: null });
    const name = value.trim().slice(0, 100);
    if (!name || name === group.name) return;
    void updateLibrary((items) =>
      items.map((item) => (item.id === group.id ? { ...item, name } : item)),
    );
  };
  return (
    <input
      autoFocus
      defaultValue={group.name}
      aria-label="Group name"
      maxLength={100}
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit(event.currentTarget.value);
        if (event.key === 'Escape') {
          settled.current = true;
          useGroupRename.setState({ id: null });
        }
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      className="editing-field h-[24px] min-w-0 flex-1 rounded-inner px-1.5 text-fg select-text"
    />
  );
}

function groupEntries(group: SavedCollection): MenuEntry[] {
  return [
    {
      kind: 'action',
      label: `Open as Trail (${group.links.length})`,
      icon: <Play {...ICON} />,
      disabled: !group.links.length,
      run: () => void openGroup(group),
    },
    {
      kind: 'action',
      label: 'Rename…',
      icon: <Pencil {...ICON} />,
      run: () => useGroupRename.setState({ id: group.id }),
    },
    {
      kind: 'action',
      label: 'Copy Links',
      icon: <Copy {...ICON} />,
      disabled: !group.links.length,
      run: () => {
        void navigator.clipboard
          .writeText(
            group.links
              .map((link) => `${link.title}\n${link.url}`)
              .join('\n\n'),
          )
          .then(() => collectionNotice('Links copied.'))
          .catch(() => collectionNotice('Could not copy the links.'));
      },
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Delete Group',
      icon: <Trash2 {...ICON} />,
      run: () => {
        let at = 0;
        void updateLibrary((items) => {
          at = items.findIndex((item) => item.id === group.id);
          return items.filter((item) => item.id !== group.id);
        }).then((saved) => {
          if (!saved) return;
          useToast.getState().show({
            message: `Deleted ${group.name}`,
            detail: null,
            durationMs: 7000,
            actions: [
              {
                label: 'Undo',
                icon: 'undo',
                run: () => {
                  void updateLibrary((items) => {
                    if (items.some((item) => item.id === group.id))
                      return items;
                    const next = [...items];
                    next.splice(Math.max(0, at), 0, group);
                    return next;
                  });
                },
              },
            ],
          });
        });
      },
    },
  ];
}
