import type { PaletteItem } from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';

/**
 * Carries out a palette or suggestion choice. `navigate` items open in the
 * current page from the address bar and in a new page from the palette.
 */
export async function runPaletteItem(
  item: PaletteItem,
  from: 'palette' | 'address',
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
  }

  overlay.close();
  switch (item.kind) {
    case 'page':
      await splash.activatePage(item.pageId);
      splash.focusPage();
      return;
    case 'history':
      if (from === 'address' && active)
        await splash.navigate(active.id, item.url);
      else await splash.createPage(item.url);
      splash.focusPage();
      return;
    case 'navigate':
      if (from === 'address' && active)
        await splash.navigate(active.id, item.input);
      else await splash.createPage(item.input);
      splash.focusPage();
      return;
    case 'command':
      switch (item.command) {
        case 'new-page':
          await splash.createPage();
          return shell.focusAddressBar();
        case 'new-child-page':
          if (active) await splash.createChildPage(active.id);
          else await splash.createPage();
          return shell.focusAddressBar();
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
        default:
          return;
      }
  }
}
