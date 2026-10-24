import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { TrailWindow } from '../windows/browser-window';

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
      label: 'New Workspace…',
      accelerator: options.accelerators ? 'Shift+CmdOrCtrl+N' : undefined,
      click: () => trailWindow.sendUiCommand({ type: 'create-workspace' }),
    },
    {
      label: 'Customize Workspace…',
      click: () => trailWindow.sendUiCommand({ type: 'customize-workspace' }),
    },
    {
      label: 'Rename Workspace',
      click: () => trailWindow.sendUiCommand({ type: 'rename-workspace' }),
    },
    {
      // Undoable with Reopen Closed Page, so no confirmation is needed.
      label: 'Delete Workspace',
      enabled: workspaces.length > 1,
      click: () => controller.deleteWorkspace(activeWorkspaceId),
    },
  ];
}

export function showWorkspaceMenu(trailWindow: TrailWindow): void {
  Menu.buildFromTemplate(
    workspaceMenuItems(trailWindow, { accelerators: false }),
  ).popup({ window: trailWindow.window });
}
