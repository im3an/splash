import type { PaletteScope } from '../../shared/palette';
import type { PaletteItem } from '../../shared/types';
import { pageLabel } from './format';
import { noticeToast } from './notices';
import { api } from '../splash-api';
import { openLocation, useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';

/**
 * Carries out a palette or suggestion choice. Addresses and history open in
 * the current page from the address bar or the location palette, and in a
 * new page from ⌘K.
 */
export async function runPaletteItem(
  item: PaletteItem,
  from: PaletteScope,
): Promise<void> {
  const splash = api();
  const shell = useShell.getState();
  const overlay = useOverlay.getState();
  const active = selectActivePage(shell);

  // Commands that open another overlay take over the current one.
  if (item.kind === 'command') {
    if (item.command === 'new-workspace') {
      return overlay.open({ kind: 'workspace-editor', workspaceId: null });
    }
    if (item.command === 'customize-workspace' && shell.snapshot) {
      return overlay.open({
        kind: 'workspace-editor',
        workspaceId: shell.snapshot.activeWorkspaceId,
      });
    }
    if (item.command === 'site-info' && active?.url) {
      return overlay.open({ kind: 'site-info' });
    }
    if (item.command === 'show-downloads' || item.command === 'show-history') {
      overlay.close();
      return shell.setSidebarPanel(
        item.command === 'show-downloads' ? 'downloads' : 'history',
      );
    }
  }

  overlay.close();
  switch (item.kind) {
    case 'page':
      await splash.activatePage(item.pageId);
      splash.focusPage();
      return;
    case 'workspace':
      await splash.switchWorkspace(item.workspaceId);
      splash.focusPage();
      return;
    case 'history':
    case 'search':
      if (from !== 'palette' && active)
        await splash.navigate(active.id, item.url);
      else await splash.createPage(item.url);
      splash.focusPage();
      return;
    case 'navigate':
      if (from !== 'palette' && active)
        await splash.navigate(active.id, item.input);
      else await splash.createPage(item.input);
      splash.focusPage();
      return;
    case 'command':
      switch (item.command) {
        case 'new-page':
          await splash.createPage();
          return void openLocation();
        case 'new-child-page':
          if (active) await splash.createChildPage(active.id);
          else await splash.createPage();
          return void openLocation();
        case 'reopen-closed':
          await splash.reopenClosed();
          return;
        case 'close-page':
          if (active) await splash.closePage(active.id);
          return;
        case 'toggle-sidebar':
          return shell.toggleSidebar();
        case 'find':
          return shell.requestFind('open');
        case 'zoom-reset':
          if (active) await splash.zoom(active.id, 'reset');
          return;
        case 'mute-page':
          if (active) await splash.setMuted(active.id, !active.isMuted);
          return;
        case 'toggle-split':
          if (active) await splash.toggleSplit(active.id);
          return;
        case 'pin-page':
          if (active) await splash.setPinned(active.id, !active.isPinned);
          return;
        case 'reload':
          if (active) await splash.reload(active.id);
          return;
        case 'duplicate-page':
          if (active) await splash.duplicatePage(active.id);
          return;
        case 'copy-link':
          if (!active?.url) return;
          await navigator.clipboard.writeText(active.url);
          return useToast.getState().show(
            noticeToast({
              kind: 'copied',
              what: 'link',
              subject: pageLabel(active),
            }),
          );
        case 'close-branch':
          if (active) await splash.closeBranch(active.id);
          return;
        case 'rename-page':
          if (active) shell.startRename(active.id);
          return;
        case 'edit-note':
          if (active) shell.editNote(active.id);
          return;
        case 'open-settings':
          return splash.openSettings();
        case 'zoom-in':
        case 'zoom-out':
          if (active) {
            await splash.zoom(
              active.id,
              item.command === 'zoom-in' ? 'in' : 'out',
            );
          }
          return;
        default:
          return;
      }
  }
}
