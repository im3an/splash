import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Smile,
  Trash2,
  Ungroup,
} from 'lucide-react';
import type { PageGroup } from '../../shared/types';
import { collectionNotice } from '../lib/collections';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { api } from '../splash-api';
import { openLocation } from '../stores/shell-store';
import { selectMinimalTrail, useShell } from '../stores/shell-store';
import type { MenuEntry } from './ContextMenu';
import { GroupIconPicker, GroupMark } from './GroupIconPicker';
import { Reveal } from './Reveal';
import { useGroupRename } from './SavedGroups';

const ICON = { size: 14 } as const;

/**
 * A group in the trail: a named card holding ordinary pages. Folding it only
 * hides them from the list; they stay open and keep their places.
 */
export function TrailGroup({
  group,
  count,
  children,
}: {
  group: PageGroup;
  /** Pages in the group, including the ones under its top-level pages. */
  count: number;
  children: ReactNode;
}) {
  const menu = useSidebarMenu('Group');
  const renaming = useGroupRename((state) => state.id === group.id);
  const minimal = useShell(selectMinimalTrail);
  const open = !group.collapsed;
  const pages = `${count} ${count === 1 ? 'page' : 'pages'}`;
  const [picking, setPicking] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLButtonElement>(null);
  const onMenu = (event: MouseEvent<HTMLElement>, anchored?: boolean) =>
    menu.show(
      event,
      groupEntries(group, count, () => setPicking(true)),
      anchored,
    );
  // Branches shows no mark until the group has been given one.
  const marked = minimal || group.icon !== undefined;

  return (
    <div className="group-card" data-open={open} data-group-id={group.id}>
      <div
        ref={rowRef}
        className="sidebar-row group"
        data-menu-open={picking || menu.openOn?.dataset.group === group.id}
        // Dragged out of the window, it arrives as a Markdown file.
        draggable={!renaming && count > 0}
        onDragStart={(event) => {
          event.preventDefault();
          void api().dragTrailOut({ groupId: group.id });
        }}
        onContextMenu={(event) => onMenu(event)}
        onDoubleClick={(event) => {
          event.preventDefault();
          useGroupRename.setState({ id: group.id });
        }}
      >
        {renaming ? (
          <span className="sidebar-row-main">
            <GroupNameField group={group} />
          </span>
        ) : (
          <button
            type="button"
            className="sidebar-row-main"
            aria-expanded={open}
            aria-label={`${group.name}, Group, ${pages}`}
            onClick={(event) => {
              // The second click of a double-click renames instead.
              if (event.detail > 1) return;
              void api().setGroupCollapsed(group.id, open);
            }}
          >
            {minimal ? (
              <>
                <span className="grid size-4 shrink-0 place-items-center">
                  <ChevronRight
                    size={13}
                    aria-hidden
                    className="group-card-chevron"
                  />
                </span>
                <span className="size-4 shrink-0" aria-hidden />
                <span className="group-card-name">{group.name}</span>
              </>
            ) : (
              <>
                {marked && <span className="size-4 shrink-0" aria-hidden />}
                <span className="group-card-name">{group.name}</span>
                <ChevronRight
                  size={12}
                  aria-hidden
                  className="group-card-chevron"
                />
                {!open && <span className="sidebar-row-count">{count}</span>}
              </>
            )}
          </button>
        )}
        {!renaming && marked && (
          // Beside the row's main button rather than in it, over the room
          // it leaves: a click here changes the icon without folding.
          <button
            ref={markRef}
            type="button"
            aria-label={`Change icon for ${group.name}`}
            aria-expanded={picking}
            title="Change Icon"
            onClick={() => setPicking((was) => !was)}
            onDoubleClick={(event) => event.stopPropagation()}
            className="group-card-mark"
          >
            <GroupMark group={group} />
          </button>
        )}
        {!renaming && (
          <button
            type="button"
            data-group={group.id}
            aria-label={`Actions for ${group.name}`}
            title="Actions"
            aria-haspopup="menu"
            onClick={(event) => onMenu(event, true)}
            className="sidebar-row-more"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
      <Reveal show={open}>
        <div className="group-card-pages" role="group" aria-label={group.name}>
          {count === 0 ? (
            <p className="group-card-empty">Add pages from a page’s menu.</p>
          ) : (
            children
          )}
        </div>
      </Reveal>
      {menu.element}
      {picking && (markRef.current ?? rowRef.current) && (
        <GroupIconPicker
          group={group}
          anchor={(markRef.current ?? rowRef.current)!}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function GroupNameField({ group }: { group: PageGroup }) {
  const settled = useRef(false);
  const commit = (value: string) => {
    if (settled.current) return;
    settled.current = true;
    useGroupRename.setState({ id: null });
    const name = value.trim().slice(0, 100);
    if (name && name !== group.name) void api().renameGroup(group.id, name);
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

function groupEntries(
  group: PageGroup,
  count: number,
  changeIcon: () => void,
): MenuEntry[] {
  const snapshot = useShell.getState().snapshot;
  const members = (snapshot?.rootIds ?? []).filter(
    (id) => snapshot?.pages[id]?.groupId === group.id,
  );
  return [
    {
      kind: 'action',
      label: 'New Page in Group',
      icon: <Plus {...ICON} />,
      run: async () => {
        const id = await api().createPage();
        await api().setPageGroup(id, group.id);
        void openLocation();
      },
    },
    {
      kind: 'action',
      label: 'Rename…',
      icon: <Pencil {...ICON} />,
      run: () => useGroupRename.setState({ id: group.id }),
    },
    {
      kind: 'action',
      label: 'Change Icon…',
      icon: <Smile {...ICON} />,
      run: changeIcon,
    },
    {
      kind: 'action',
      label: 'Copy Links',
      icon: <Copy {...ICON} />,
      disabled: members.length === 0,
      run: () => {
        const links = members
          .map((id) => snapshot?.pages[id])
          .filter((page) => page?.url)
          .map((page) => `${page!.customTitle ?? page!.title}\n${page!.url}`);
        void navigator.clipboard
          .writeText(links.join('\n\n'))
          .then(() => collectionNotice('Links copied.'))
          .catch(() => collectionNotice('Could not copy the links.'));
      },
    },
    { kind: 'separator' },
    // With nothing inside, keeping the pages and closing them are the same.
    ...(count > 0
      ? [
          {
            kind: 'action',
            label: 'Ungroup',
            icon: <Ungroup {...ICON} />,
            run: () => void api().deleteGroup(group.id),
          } satisfies MenuEntry,
        ]
      : []),
    {
      kind: 'action',
      label:
        count > 0
          ? `Delete Group and ${count} ${count === 1 ? 'Page' : 'Pages'}`
          : 'Delete Group',
      icon: <Trash2 {...ICON} />,
      run: () => void api().deleteGroupWithPages(group.id),
    },
  ];
}
