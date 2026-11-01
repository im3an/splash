import {
  Star,
  Share,
  ArrowLeft,
  ArrowRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Copy,
  CornerDownRight,
  FolderInput,
  Link,
  ListX,
  Moon,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  StickyNote,
  Type,
  X,
} from 'lucide-react';
import type { BrowserSnapshot, PageId } from '../../shared/types';
import { bookmarkPage, collectionNotice } from '../lib/collections';
import { pageLabel } from '../lib/format';
import { noticeToast } from '../lib/notices';
import { api } from '../splash-api';
import { openLocation } from '../stores/overlay-store';
import { usePageMenu } from '../stores/page-menu-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { WorkspaceIcon } from './WorkspaceIcon';

const ICON = { size: 14, strokeWidth: 1.75 } as const;

function branchSize(snapshot: BrowserSnapshot, id: PageId): number {
  const page = snapshot.pages[id];
  if (!page) return 0;
  return page.childIds.reduce(
    (total, childId) => total + branchSize(snapshot, childId),
    1,
  );
}

/**
 * What a page's menu offers. Shortcuts act on the current page, so they're
 * shown only in that page's menu.
 */
export function pageMenuEntries(
  snapshot: BrowserSnapshot,
  pageId: PageId,
): MenuEntry[] {
  const page = snapshot.pages[pageId];
  if (!page) return [];
  const splash = api();
  const shell = useShell.getState();
  const url = page.url;
  const hasChildren = page.childIds.length > 0;
  const activeId = snapshot.activePageId;
  const current = pageId === activeId;
  const key = (shortcut: string) => (current ? shortcut : undefined);
  const split = snapshot.split;
  const splitShowing =
    split !== null &&
    activeId !== null &&
    [split.leftId, split.rightId].includes(activeId);
  const inShowingSplit =
    splitShowing && [split.leftId, split.rightId].includes(pageId);
  const otherWorkspaces = snapshot.workspaces.filter(
    (workspace) => workspace.id !== snapshot.activeWorkspaceId,
  );

  const splitEntry: MenuEntry = inShowingSplit
    ? {
        kind: 'action',
        label: 'Close Split View',
        icon: <Columns2 {...ICON} />,
        shortcut: key('⌘\\'),
        run: () => void splash.closeSplit(),
      }
    : !current && activeId !== null
      ? {
          kind: 'action',
          label: 'Open in Split View',
          icon: <Columns2 {...ICON} />,
          run: () => void splash.openSplit(pageId, activeId),
        }
      : {
          // The split pairs a page with its parent, or else a child.
          kind: 'action',
          label:
            page.parentId !== null
              ? 'Compare with Parent'
              : 'Compare with Child',
          icon: <Columns2 {...ICON} />,
          shortcut: key('⌘\\'),
          disabled: page.parentId === null && !hasChildren,
          run: () => void splash.toggleSplit(pageId),
        };

  const entries: (MenuEntry | false)[] = [
    {
      kind: 'action',
      label: 'New Child Page',
      icon: <CornerDownRight {...ICON} />,
      shortcut: key('⌥⌘T'),
      run: async () => {
        await splash.createChildPage(pageId);
        void openLocation();
      },
    },
    {
      kind: 'action',
      label: 'Duplicate',
      icon: <Copy {...ICON} />,
      disabled: url === null,
      run: () => void splash.duplicatePage(pageId),
    },
    {
      kind: 'action',
      label: page.isPinned ? 'Unpin Page' : 'Pin Page',
      icon: page.isPinned ? <PinOff {...ICON} /> : <Pin {...ICON} />,
      shortcut: key('⌘D'),
      run: () => void splash.setPinned(pageId, !page.isPinned),
    },
    {
      kind: 'action',
      label: 'Bookmark Page',
      icon: <Star {...ICON} />,
      disabled: !url || !/^https?:/.test(url),
      run: () => {
        void bookmarkPage(page);
      },
    },
    {
      kind: 'action',
      label: 'Share Page…',
      icon: <Share {...ICON} />,
      disabled: !url || !/^https?:/.test(url),
      run: () => {
        void splash
          .sharePage(pageId)
          .catch(() => collectionNotice('Could not open sharing.'));
      },
    },
    { kind: 'separator' },
    splitEntry,
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Rename…',
      icon: <Pencil {...ICON} />,
      run: () => shell.startRename(pageId),
    },
    !!page.customTitle && {
      kind: 'action',
      label: 'Use Page Title',
      icon: <Type {...ICON} />,
      run: () => void splash.renamePage(pageId, null),
    },
    {
      kind: 'action',
      label: page.note ? 'Edit Note…' : 'Add Note…',
      icon: <StickyNote {...ICON} />,
      run: () => shell.editNote(pageId),
    },
    {
      kind: 'action',
      label: 'Copy Link',
      icon: <Link {...ICON} />,
      shortcut: key('⇧⌘C'),
      disabled: url === null,
      run: async () => {
        if (!url) return;
        await navigator.clipboard.writeText(url);
        useToast.getState().show(
          noticeToast({
            kind: 'copied',
            what: 'link',
            subject: pageLabel(page),
          }),
        );
      },
    },
    otherWorkspaces.length > 0 && {
      kind: 'submenu',
      label: 'Move to Workspace',
      icon: <FolderInput {...ICON} />,
      entries: otherWorkspaces.map((workspace) => ({
        kind: 'action',
        label: workspace.name,
        icon: (
          <WorkspaceIcon
            icon={workspace.appearance.icon}
            name={workspace.name}
            size={13}
          />
        ),
        run: () => void splash.movePageToWorkspace(pageId, workspace.id),
      })),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Back',
      icon: <ArrowLeft {...ICON} />,
      shortcut: key('⌘['),
      disabled: !page.canGoBack,
      run: () => void splash.goBack(pageId),
    },
    {
      kind: 'action',
      label: 'Forward',
      icon: <ArrowRight {...ICON} />,
      shortcut: key('⌘]'),
      disabled: !page.canGoForward,
      run: () => void splash.goForward(pageId),
    },
    {
      kind: 'action',
      label: 'Reload',
      icon: <RotateCw {...ICON} />,
      shortcut: key('⌘R'),
      disabled: url === null,
      run: () => void splash.reload(pageId),
    },
    { kind: 'separator' },
    hasChildren && {
      kind: 'action',
      label: page.collapsed ? 'Expand Branch' : 'Collapse Branch',
      icon: page.collapsed ? (
        <ChevronsUpDown {...ICON} />
      ) : (
        <ChevronsDownUp {...ICON} />
      ),
      run: () => void splash.setCollapsed(pageId, !page.collapsed),
    },
    { kind: 'separator' },
    ...(page.isPinned
      ? ([
          {
            kind: 'action',
            label: 'Put to Sleep',
            icon: <Moon {...ICON} />,
            disabled: url === null || page.isDiscarded,
            run: () => void splash.closePage(pageId),
          },
          {
            kind: 'action',
            label: 'Unpin and Close',
            icon: <X {...ICON} />,
            run: () => void splash.closePage(pageId, { unpin: true }),
          },
        ] satisfies MenuEntry[])
      : ([
          {
            kind: 'action',
            label: 'Close Page',
            icon: <X {...ICON} />,
            shortcut: key('⌘W'),
            run: () => void splash.closePage(pageId),
          },
        ] satisfies MenuEntry[])),
    hasChildren &&
      !page.isPinned && {
        kind: 'action',
        label: `Close Branch (${branchSize(snapshot, pageId)} Pages)`,
        icon: <ListX {...ICON} />,
        shortcut: key('⌥⌘W'),
        run: () => void splash.closeBranch(pageId),
      },
  ];
  return entries.filter((entry) => entry !== false);
}

/** The menu for a page in the sidebar, opened by right-clicking its row. */
export function PageMenu() {
  const menu = usePageMenu((state) => state.menu);
  const serial = usePageMenu((state) => state.serial);
  const snapshot = useShell((state) => state.snapshot);
  const page = menu && snapshot?.pages[menu.pageId];
  if (!menu || !snapshot || !page) return null;

  // Kept to the sidebar: the page view would cover anything past it.
  const sidebar = menu.returnFocus?.closest('aside')?.getBoundingClientRect();
  return (
    <ContextMenu
      key={serial}
      label={`${pageLabel(page)} menu`}
      entries={pageMenuEntries(snapshot, menu.pageId)}
      x={menu.x}
      y={menu.y}
      bounds={{
        left: sidebar?.left ?? 0,
        right: sidebar?.right ?? window.innerWidth,
      }}
      fromKeyboard={menu.fromKeyboard}
      returnFocus={menu.returnFocus}
      onClose={() => usePageMenu.getState().close(menu)}
    />
  );
}
