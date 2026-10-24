import {
  dialog,
  Menu,
  type BaseWindow,
  type MenuItemConstructorOptions,
} from 'electron';
import type { WorkspaceId } from '../../shared/types';
import type { TrailWindow } from '../windows/browser-window';

/** Asks before deleting a workspace that still holds pages. */
export async function confirmDeleteWorkspace(
  trailWindow: TrailWindow,
  workspaceId: WorkspaceId,
): Promise<void> {
  const { controller } = trailWindow;
  const workspace = controller
    .snapshot()
    .workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return;
  if (workspace.pageCount > 0) {
    const { response } = await dialog.showMessageBox(
      trailWindow.window as BaseWindow,
      {
        type: 'warning',
        message: `Delete “${workspace.name}”?`,
        detail: `Its ${workspace.pageCount} page${workspace.pageCount === 1 ? '' : 's'} will be closed. This can’t be undone.`,
        buttons: ['Delete Workspace', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      },
    );
    if (response !== 0) return;
  }
  controller.deleteWorkspace(workspaceId);
}

/**
 * Workspace switching and management, shared by the menu bar and the
 * sidebar's workspace button.
 */
export function workspaceMenuItems(
  trailWindow: TrailWindow | null,
  options: { accelerators: boolean },
): MenuItemConstructorOptions[] {
  if (!trailWindow) {
    return [{ label: 'No Window', enabled: false }];
  }
  const { controller } = trailWindow;
  const { workspaces, activeWorkspaceId } = controller.snapshot();

  const switchItems = workspaces.map(
    (workspace, index): MenuItemConstructorOptions => ({
      label: workspace.name,
      type: 'radio',
      checked: workspace.id === activeWorkspaceId,
      accelerator:
        options.accelerators && index < 9 ? `Ctrl+${index + 1}` : undefined,
      click: () => controller.switchWorkspace(workspace.id),
    }),
  );

  return [
    ...switchItems,
    { type: 'separator' },
    {
      label: 'New Workspace',
      accelerator: options.accelerators ? 'Shift+CmdOrCtrl+N' : undefined,
      click: () => {
        controller.createWorkspace();
        trailWindow.sendUiCommand({ type: 'rename-workspace' });
      },
    },
    {
      label: 'Rename Workspace…',
      click: () => trailWindow.sendUiCommand({ type: 'rename-workspace' }),
    },
    {
      label: 'Delete Workspace…',
      enabled: workspaces.length > 1,
      click: () => void confirmDeleteWorkspace(trailWindow, activeWorkspaceId),
    },
  ];
}

export function showWorkspaceMenu(trailWindow: TrailWindow): void {
  Menu.buildFromTemplate(
    workspaceMenuItems(trailWindow, { accelerators: false }),
  ).popup({ window: trailWindow.window });
}
