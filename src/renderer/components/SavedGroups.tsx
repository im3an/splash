import { useRef, type CSSProperties, type MouseEvent } from 'react';
import { create } from 'zustand';
import { ChevronRight, Copy, Pencil, Play, Trash2 } from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import {
  collectionNotice,
  openGroup,
  openGroupRoot,
  updateLibrary,
} from '../lib/collections';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { useDragging } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import type { MenuEntry } from './ContextMenu';
import { Favorites } from './Favorites';
import { IconStack, openLink, StackLink, useOpenStack } from './IconStack';

const EMPTY: SavedCollection[] = [];
const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The group whose name is being edited in place, if any. */
export const useGroupRename = create<{ id: string | null }>()(() => ({
  id: null,
}));

/**
 * Saved: Favorites and the trails put away for later, each one row with an
 * icon stack. A click pops its pages out as a list; open one from there,
 * or the whole group as a trail.
 */
export function SavedGroups() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const groups = collections.filter((item) => item.kind === 'group');
  const hasFavorites = collections.some(
    (item) => item.kind === 'folder' && item.links.length > 0,
  );
  const dragging = useDragging();
  const menu = useSidebarMenu('Saved group');
  if (!groups.length && !hasFavorites && !dragging) return null;

  return (
    <details className="trail-section" aria-label="Saved" open>
      <summary className="sidebar-section-heading">
        <span className="sidebar-section-label">
          Saved
          <ChevronRight size={12} />
          <span className="sidebar-folded-count">
            {groups.length + (hasFavorites ? 1 : 0)}
          </span>
        </span>
      </summary>
      <div className="sidebar-section-content flex flex-col gap-px">
        <Favorites />
        {groups.map((group) => (
          <GroupStack
            key={group.id}
            group={group}
            menuOpen={menu.openOn?.dataset.stack === group.id}
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

function GroupStack({
  group,
  menuOpen,
  onMenu,
}: {
  group: SavedCollection;
  menuOpen: boolean;
  onMenu(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
}) {
  const renaming = useGroupRename((state) => state.id === group.id);
  // Its trail is open in this workspace: the footer shows it, not a copy.
  const isOpen = useShell((state) =>
    state.snapshot ? openGroupRoot(state.snapshot, group) !== null : false,
  );
  const activeUrl = useShell((state) => {
    const id = state.snapshot?.activePageId;
    return id ? (state.snapshot?.pages[id]?.url ?? null) : null;
  });

  return (
    <IconStack
      id={group.id}
      name={group.name}
      label="Saved group"
      links={group.links}
      menuOpen={menuOpen}
      onMenu={onMenu}
      rowProps={{
        'data-open': isOpen,
        onDoubleClick: (event: MouseEvent) => {
          event.preventDefault();
          useGroupRename.setState({ id: group.id });
        },
      }}
      renderName={renaming ? <GroupNameField group={group} /> : undefined}
      footer={
        group.links.length > 1 && (
          <button
            type="button"
            className="stack-link stack-link-action"
            style={{ '--i': Math.min(group.links.length, 12) } as CSSProperties}
            onClick={() => {
              useOpenStack.setState({ id: null });
              void openGroup(group);
            }}
          >
            <span className="stack-link-icon">
              <Play size={12} strokeWidth={2} />
            </span>
            <span className="flex-1">
              {isOpen ? 'Show trail' : 'Open all as a trail'}
            </span>
          </button>
        )
      }
    >
      {group.links.map((link, index) => (
        <StackLink
          key={link.id}
          link={link}
          index={index}
          current={link.url === activeUrl}
          onOpen={(fresh) => void openLink(link, fresh)}
        />
      ))}
    </IconStack>
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
