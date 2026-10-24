import type { BrowserSnapshot, PageId, WorkspaceId } from '../../shared/types';
import type { MenuEntry } from '../stores/ui-store';
import { countDescendants } from './registry';

const separator: MenuEntry = { kind: 'separator' };

/** The context menu for a page row. */
export function pageMenu(
  snapshot: BrowserSnapshot,
  pageId: PageId,
): MenuEntry[] {
  const page = snapshot.pages[pageId];
  if (!page) return [];
  const target = { pageId };
  const nested = countDescendants(snapshot, pageId);
  return [
    { kind: 'command', command: 'page.new-child', target },
    { kind: 'command', command: 'page.rename', target, label: 'Rename…' },
    ...(page.url
      ? ([
          separator,
          { kind: 'command', command: 'nav.reload', target },
        ] satisfies MenuEntry[])
      : []),
    separator,
    { kind: 'command', command: 'page.move-up', target },
    { kind: 'command', command: 'page.move-down', target },
    { kind: 'command', command: 'page.indent', target },
    { kind: 'command', command: 'page.outdent', target },
    separator,
    { kind: 'command', command: 'page.close', target },
    ...(nested > 0
      ? ([
          {
            kind: 'command',
            command: 'page.close-tree',
            target,
            label: `Close Page and ${nested === 1 ? 'Child' : `${nested} Children`}…`,
            destructive: true,
          },
        ] satisfies MenuEntry[])
      : []),
  ];
}

/** The context menu for a workspace (header, switcher, or empty tree area). */
export function workspaceMenu(
  snapshot: BrowserSnapshot,
  workspaceId: WorkspaceId,
): MenuEntry[] {
  const target = { workspaceId };
  const isActive = workspaceId === snapshot.activeWorkspaceId;
  return [
    ...(isActive
      ? ([
          { kind: 'command', command: 'page.new' },
          separator,
          { kind: 'command', command: 'tree.expand-all' },
          { kind: 'command', command: 'tree.collapse-all' },
          separator,
        ] satisfies MenuEntry[])
      : []),
    { kind: 'command', command: 'workspace.rename', target, label: 'Rename…' },
    { kind: 'command', command: 'workspace.new' },
    separator,
    {
      kind: 'command',
      command: 'workspace.delete',
      target,
      destructive: true,
    },
  ];
}
