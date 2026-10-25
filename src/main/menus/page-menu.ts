import { clipboard, Menu, type MenuItemConstructorOptions } from 'electron';
import type { BrowserSnapshot, PageId } from '../../shared/types';
import type { TrailWindow } from '../windows/browser-window';

function branchSize(snapshot: BrowserSnapshot, id: PageId): number {
  const page = snapshot.pages[id];
  if (!page) return 0;
  return page.childIds.reduce(
    (total, childId) => total + branchSize(snapshot, childId),
    1,
  );
}

/** The context menu for a page in the sidebar. */
export function showPageMenu(trailWindow: TrailWindow, pageId: PageId): void {
  const { controller } = trailWindow;
  const snapshot = controller.snapshot();
  const page = snapshot.pages[pageId];
  if (!page) return;
  const url = page.url;
  const hasChildren = page.childIds.length > 0;
  const activeId = snapshot.activePageId;
  const split = snapshot.split;
  const splitShowing =
    split !== null &&
    activeId !== null &&
    [split.leftId, split.rightId].includes(activeId);
  const inShowingSplit =
    splitShowing && [split.leftId, split.rightId].includes(pageId);
  const related = controller.relatedPageOf(pageId);

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'New Child Page',
      click: () => {
        controller.createChildPage(pageId);
        trailWindow.sendUiCommand({ type: 'focus-address-bar' });
      },
    },
    {
      label: 'Duplicate',
      enabled: url !== null,
      click: () => controller.duplicatePage(pageId),
    },
    { type: 'separator' },
    inShowingSplit
      ? { label: 'Close Split View', click: () => controller.closeSplit() }
      : pageId !== activeId && activeId !== null
        ? {
            label: 'Open in Split View',
            click: () => controller.openSplit(pageId, activeId),
          }
        : {
            label:
              related !== null && related === page.parentId
                ? 'Compare with Parent'
                : 'Compare with Child',
            enabled: related !== null,
            click: () => controller.toggleSplit(pageId),
          },
    { type: 'separator' },
    {
      label: 'Rename…',
      click: () => trailWindow.sendUiCommand({ type: 'rename-page', pageId }),
    },
    ...(page.customTitle
      ? [
          {
            label: 'Use Page Title',
            click: () => controller.renamePage(pageId, null),
          },
        ]
      : []),
    {
      label: page.note ? 'Edit Note…' : 'Add Note…',
      click: () => trailWindow.sendUiCommand({ type: 'edit-note', pageId }),
    },
    {
      label: 'Copy Link',
      enabled: url !== null,
      click: () => url && clipboard.writeText(url),
    },
    ...(snapshot.workspaces.length > 1
      ? ([
          {
            label: 'Move to Workspace',
            submenu: snapshot.workspaces
              .filter(
                (workspace) => workspace.id !== snapshot.activeWorkspaceId,
              )
              .map((workspace) => ({
                label: workspace.name,
                click: () =>
                  controller.movePageToWorkspace(pageId, workspace.id),
              })),
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    { type: 'separator' },
    ...(hasChildren
      ? ([
          {
            label: page.collapsed ? 'Expand Branch' : 'Collapse Branch',
            click: () => controller.setCollapsed(pageId, !page.collapsed),
          },
          { type: 'separator' },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    { label: 'Close Page', click: () => controller.closePage(pageId) },
    ...(hasChildren
      ? [
          {
            label: `Close Branch (${branchSize(snapshot, pageId)} Pages)`,
            click: () => controller.closeBranch(pageId),
          },
        ]
      : []),
  ];

  Menu.buildFromTemplate(template).popup({ window: trailWindow.window });
}
