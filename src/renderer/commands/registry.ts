import type { SplashApi } from '../../shared/api';
import type { CommandId } from '../../shared/commands';
import type {
  BrowserSnapshot,
  PageSnapshot,
  WorkspaceSummary,
} from '../../shared/types';
import { pageLabel } from '../lib/format';
import { moveTarget, type MoveDirection } from '../lib/trail';
import { usePreferences } from '../stores/preferences-store';
import { useUi } from '../stores/ui-store';

/** Everything a command needs, resolved for one invocation. */
export interface CommandContext {
  api: SplashApi;
  snapshot: BrowserSnapshot;
  /** The page acted on: the explicit target, else the active page. */
  page: PageSnapshot | null;
  /** The workspace acted on: the explicit target, else the active one. */
  workspace: WorkspaceSummary | null;
}

export interface Command {
  run(context: CommandContext): void | Promise<unknown>;
  enabled?(context: CommandContext): boolean;
  /**
   * From the keyboard or menu, act on the focused sidebar row rather than
   * the active page, so arrowing to a row and pressing F2 renames that row.
   */
  followsFocus?: boolean;
  /** Shown if the command throws; defaults to a generic message. */
  failure?: string;
}

const hasPage = ({ page }: CommandContext) => page !== null;

function move(direction: MoveDirection): Command {
  const targetOf = ({ snapshot, page }: CommandContext) =>
    page ? moveTarget(snapshot, page.id, direction) : null;
  return {
    followsFocus: true,
    enabled: (context) => targetOf(context) !== null,
    run: (context) => {
      const target = targetOf(context);
      if (!target || !context.page) return;
      return context.api.movePage(
        context.page.id,
        target.parentId,
        target.beforeId,
      );
    },
    failure: 'Couldn’t move the page.',
  };
}

function selectWorkspace(slot: number): Command {
  const at = ({ snapshot }: CommandContext) => snapshot.workspaces[slot - 1];
  return {
    enabled: (context) => at(context) !== undefined,
    run: (context) => {
      const workspace = at(context);
      if (workspace && workspace.id !== context.snapshot.activeWorkspaceId) {
        return context.api.activateWorkspace(workspace.id);
      }
    },
  };
}

function cycleWorkspace(step: 1 | -1): Command {
  return {
    enabled: ({ snapshot }) => snapshot.workspaces.length > 1,
    run: ({ api, snapshot }) => {
      const { workspaces } = snapshot;
      const index = workspaces.findIndex(
        (w) => w.id === snapshot.activeWorkspaceId,
      );
      const next = workspaces.at((index + step) % workspaces.length);
      if (next) return api.activateWorkspace(next.id);
    },
  };
}

function setAllCollapsed(collapsed: boolean): Command {
  const candidates = ({ snapshot }: CommandContext) =>
    Object.values(snapshot.pages).filter(
      (page) => page.childIds.length > 0 && page.collapsed !== collapsed,
    );
  return {
    enabled: (context) => candidates(context).length > 0,
    run: (context) =>
      Promise.all(
        candidates(context).map((page) =>
          context.api.setCollapsed(page.id, collapsed),
        ),
      ),
  };
}

function nextWorkspaceName(workspaces: readonly WorkspaceSummary[]): string {
  const taken = new Set(workspaces.map((w) => w.name));
  for (let n = workspaces.length + 1; ; n++) {
    const name = `Workspace ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Sheets and inline editors live in the sidebar, so it must be open. */
function revealSidebar() {
  usePreferences.getState().setSidebarOpen(true);
}

export const commands: Record<CommandId, Command> = {
  'page.new': {
    run: async ({ api }) => {
      await api.createPage();
      useUi.getState().focusAddressBar();
    },
    failure: 'Couldn’t open a new page.',
  },
  'page.new-child': {
    followsFocus: true,
    enabled: hasPage,
    run: async ({ api, page }) => {
      await api.createPage({ parentId: page!.id });
      useUi.getState().focusAddressBar();
    },
    failure: 'Couldn’t open a new page.',
  },
  'page.rename': {
    followsFocus: true,
    enabled: hasPage,
    run: ({ page }) => {
      revealSidebar();
      useUi.getState().startEditing({ kind: 'page', id: page!.id });
    },
  },
  'page.close': {
    enabled: hasPage,
    run: ({ api, page }) => api.closePage(page!.id),
    failure: 'Couldn’t close the page.',
  },
  'page.close-tree': {
    followsFocus: true,
    enabled: hasPage,
    run: async ({ api, snapshot, page }) => {
      const nested = countDescendants(snapshot, page!.id);
      if (nested > 0) {
        revealSidebar();
        const confirmed = await useUi.getState().confirm({
          title: `Close “${pageLabel(page!)}”?`,
          message: `The ${nested === 1 ? 'page' : `${nested} pages`} nested under it will close too.`,
          confirmLabel: `Close ${nested + 1} Pages`,
          destructive: true,
        });
        if (!confirmed) return;
      }
      return api.closePage(page!.id, { withDescendants: true });
    },
    failure: 'Couldn’t close the pages.',
  },
  'page.move-up': move('up'),
  'page.move-down': move('down'),
  'page.indent': move('indent'),
  'page.outdent': move('outdent'),

  'nav.back': {
    enabled: ({ page }) => Boolean(page?.canGoBack),
    run: ({ api, page }) => api.goBack(page!.id),
    failure: 'Couldn’t go back.',
  },
  'nav.forward': {
    enabled: ({ page }) => Boolean(page?.canGoForward),
    run: ({ api, page }) => api.goForward(page!.id),
    failure: 'Couldn’t go forward.',
  },
  'nav.reload': {
    enabled: ({ page }) => Boolean(page?.url) && !page?.isLoading,
    run: ({ api, page }) => api.reload(page!.id),
    failure: 'Couldn’t reload the page.',
  },
  'nav.stop': {
    enabled: ({ page }) => Boolean(page?.isLoading),
    run: ({ api, page }) => api.stop(page!.id),
    failure: 'Couldn’t stop loading.',
  },
  'address.focus': {
    run: () => useUi.getState().focusAddressBar(),
  },
  'sidebar.toggle': {
    run: () => usePreferences.getState().toggleSidebar(),
  },
  'tree.collapse-all': setAllCollapsed(true),
  'tree.expand-all': setAllCollapsed(false),

  'workspace.new': {
    run: async ({ api, snapshot }) => {
      const id = await api.createWorkspace(
        nextWorkspaceName(snapshot.workspaces),
      );
      revealSidebar();
      useUi.getState().startEditing({ kind: 'workspace', id });
    },
    failure: 'Couldn’t create a workspace.',
  },
  'workspace.rename': {
    enabled: ({ workspace }) => workspace !== null,
    run: ({ workspace }) => {
      revealSidebar();
      useUi.getState().startEditing({ kind: 'workspace', id: workspace!.id });
    },
  },
  'workspace.delete': {
    enabled: ({ snapshot, workspace }) =>
      workspace !== null && snapshot.workspaces.length > 1,
    run: async ({ api, workspace }) => {
      const { id, name, pageCount } = workspace!;
      if (pageCount > 0) {
        revealSidebar();
        const confirmed = await useUi.getState().confirm({
          title: `Delete “${name}”?`,
          message: `Its ${pageCount === 1 ? 'page' : `${pageCount} pages`} will be closed. This can’t be undone.`,
          confirmLabel: 'Delete Workspace',
          destructive: true,
        });
        if (!confirmed) return;
      }
      return api.deleteWorkspace(id);
    },
    failure: 'Couldn’t delete the workspace.',
  },
  'workspace.next': cycleWorkspace(1),
  'workspace.previous': cycleWorkspace(-1),
  'workspace.select-1': selectWorkspace(1),
  'workspace.select-2': selectWorkspace(2),
  'workspace.select-3': selectWorkspace(3),
  'workspace.select-4': selectWorkspace(4),
  'workspace.select-5': selectWorkspace(5),
  'workspace.select-6': selectWorkspace(6),
  'workspace.select-7': selectWorkspace(7),
  'workspace.select-8': selectWorkspace(8),
  'workspace.select-9': selectWorkspace(9),

  'appearance.system': {
    run: () => usePreferences.getState().setAppearance('system'),
  },
  'appearance.light': {
    run: () => usePreferences.getState().setAppearance('light'),
  },
  'appearance.dark': {
    run: () => usePreferences.getState().setAppearance('dark'),
  },
  'help.shortcuts': {
    run: () => {
      revealSidebar();
      useUi.getState().showShortcuts();
    },
  },
};

export function countDescendants(
  snapshot: BrowserSnapshot,
  id: string,
): number {
  const page = snapshot.pages[id];
  if (!page) return 0;
  return page.childIds.reduce(
    (total, childId) => total + 1 + countDescendants(snapshot, childId),
    0,
  );
}
