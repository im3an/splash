import { specOf, type CommandId } from '../../shared/commands';
import type { PageId } from '../../shared/types';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { useUi, type CommandTarget } from '../stores/ui-store';
import { commands, type CommandContext } from './registry';

export type CommandSource = 'pointer' | 'keyboard';

/** The sidebar row that has keyboard focus, if any. */
function focusedPageId(): PageId | undefined {
  const row = document.activeElement?.closest<HTMLElement>('[data-row-id]');
  return row?.dataset.rowId;
}

function resolveContext(
  id: CommandId,
  target: CommandTarget,
  source: CommandSource,
): CommandContext | null {
  const snapshot = useShell.getState().snapshot;
  if (!snapshot) return null;
  const pageId =
    target.pageId ??
    (source === 'keyboard' && commands[id].followsFocus
      ? focusedPageId()
      : undefined) ??
    snapshot.activePageId;
  const workspaceId = target.workspaceId ?? snapshot.activeWorkspaceId;
  return {
    api: api(),
    snapshot,
    page: (pageId && snapshot.pages[pageId]) || null,
    workspace: snapshot.workspaces.find((w) => w.id === workspaceId) ?? null,
  };
}

export function isCommandEnabled(
  id: CommandId,
  target: CommandTarget = {},
  source: CommandSource = 'pointer',
): boolean {
  const context = resolveContext(id, target, source);
  if (!context) return false;
  return commands[id].enabled?.(context) ?? true;
}

/**
 * The one way commands run, whether from a button, a context menu, a
 * shortcut or the app menu. Failures become a toast instead of an
 * unhandled rejection.
 */
export async function runCommand(
  id: CommandId,
  target: CommandTarget = {},
  source: CommandSource = 'pointer',
): Promise<void> {
  const context = resolveContext(id, target, source);
  const command = commands[id];
  if (!context || !(command.enabled?.(context) ?? true)) return;
  // A pending confirmation is abandoned when the user does something else.
  if (id !== 'help.shortcuts' && useUi.getState().sheet) {
    useUi.getState().closeSheet(false);
  }
  try {
    await command.run(context);
  } catch (error) {
    console.warn(`Command ${id} failed`, error);
    useUi
      .getState()
      .notify(
        command.failure ?? `Couldn’t complete “${specOf(id).title}”.`,
        'error',
      );
  }
}

/**
 * Runs a direct backend call made by the UI (activating, collapsing,
 * renaming…) and turns a failure into a toast.
 */
export async function attempt(
  work: () => Promise<unknown>,
  failure: string,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.warn(failure, error);
    useUi.getState().notify(failure, 'error');
  }
}
