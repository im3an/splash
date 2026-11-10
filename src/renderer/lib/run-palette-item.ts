import type { PaletteScope } from '../../shared/palette';
import type { PaletteItem } from '../../shared/types';
import { bookmarkBranch, setBookmarksBar } from './bookmarks';
import { pageLabel } from './format';
import { noticeToast } from './notices';
import { api } from '../splash-api';
import { useAiPanel } from '../stores/ai-store';
import { showBookmarks } from '../stores/bookmarks-view-store';
import { useOverlay } from '../stores/overlay-store';
import { openNotes } from '../stores/notes-store';
import {
  openLocation,
  selectActivePage,
  useShell,
} from '../stores/shell-store';
import { useToast } from '../stores/toast-store';

/**
 * Carries out a palette or suggestion choice. Addresses and history open in
 * the current page from the address bar or the location palette, and in a
 * new page from ⌘K.
 */
async function performPaletteItem(
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
      overlay.close();
      return shell.editWorkspace(null);
    }
    if (item.command === 'customize-workspace' && shell.snapshot) {
      overlay.close();
      return shell.editWorkspace(shell.snapshot.activeWorkspaceId);
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
    if (item.command === 'show-bookmarks') {
      overlay.close();
      return shell.setSidebarPanel('bookmarks');
    }
    if (item.command === 'show-trail-summary') {
      overlay.close();
      return shell.setSidebarPanel('trails');
    }
    if (item.command === 'show-tasks') {
      overlay.close();
      return shell.setSidebarPanel('tasks');
    }
    if (item.command === 'show-notes') return openNotes();
    if (item.command === 'show-alma-view') {
      // Swaps with the palette, so the page stays frozen in between.
      return overlay.open({ kind: 'alma-view' });
    }
    if (item.command === 'filter-pages') {
      // Closed first: closing puts focus back, and the field should keep it.
      overlay.close();
      return shell.openTrailFilter();
    }
  }

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
    case 'bookmark':
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
        case 'new-sibling-page':
          if (active) await splash.createSiblingPage(active.id);
          else await splash.createPage();
          return void openLocation();
        case 'collapse-other-trails':
          if (active) await splash.collapseOtherTrails(active.id);
          return;
        case 'import-trail':
          return void splash.importTrailFile();
        case 'paste-outline':
          return void splash.pasteOutline(null);
        case 'open-file':
          return void splash.chooseFiles();
        case 'new-private-window':
          return void splash.newPrivateWindow();
        case 'manage-passwords':
          return void splash.openSettingsSection('passwords');
        case 'import-data':
          return void splash.openSettingsSection('transfer');
        case 'export-bookmarks':
          return void splash.exportBookmarks();
        case 'export-trail':
          return void splash.exportTrail();
        case 'picture-in-picture':
          if (active) await splash.togglePictureInPicture(active.id);
          return;
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
        case 'copy-markdown':
        case 'copy-text':
          if (active)
            await splash.copyPageAs(
              active.id,
              item.command === 'copy-markdown' ? 'markdown' : 'text',
            );
          return;
        case 'paste-and-go':
          await splash.pasteAndGo();
          return;
        case 'go-home':
          await splash.goHome();
          return;
        case 'close-branch':
          if (active) await splash.closeBranch(active.id);
          return;
        case 'close-others':
          if (active) await splash.closeOtherPages(active.id);
          return;
        case 'close-below':
          if (active) await splash.closePagesBelow(active.id);
          return;
        case 'view-source':
          if (active) await splash.viewSource(active.id);
          return;
        case 'dev-tools':
          if (active) await splash.toggleDevTools(active.id);
          return;
        case 'toggle-ai-panel':
          return useAiPanel.getState().toggle();
        case 'toggle-bookmarks-bar':
          return setBookmarksBar(!shell.preferences?.bookmarksBar);
        case 'bookmark-branch':
          if (active && shell.snapshot)
            await bookmarkBranch(
              shell.snapshot,
              active.id,
              pageLabel(active),
              showBookmarks,
            );
          return;
        case 'go-back':
          if (active) await splash.goBack(active.id);
          return;
        case 'go-forward':
          if (active) await splash.goForward(active.id);
          return;
        case 'print':
          if (active) await splash.print(active.id);
          return;
        case 'save-page':
          if (active) await splash.savePageAs(active.id);
          return;
        case 'close-split':
          await splash.closeSplit();
          return;
        case 'rename-workspace':
          return shell.setRenamingWorkspace(true);
        case 'delete-workspace':
          if (shell.snapshot)
            await splash.deleteWorkspaceFromShell(
              shell.snapshot.activeWorkspaceId,
            );
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

/** Keep the query and overlay until an action actually succeeds. */
export async function runPaletteItem(
  item: PaletteItem,
  from: PaletteScope,
): Promise<boolean> {
  const original = useOverlay.getState().overlay;
  try {
    await performPaletteItem(item, from);
    if (useOverlay.getState().overlay === original)
      useOverlay.getState().close();
    return true;
  } catch {
    useToast.getState().show({
      message: 'Could not complete that action.',
      detail: 'Your search is kept. Try again.',
      actions: [],
      durationMs: 5000,
    });
    return false;
  }
}
