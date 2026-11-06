import { writeFile } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dialog, type BaseWindow } from 'electron';
import type { ImportResult } from '../../shared/types';
import type { BrowserController } from '../browser/browser-controller';
import type { PreferencesService } from '../preferences';
import type { Vault } from '../vault/vault';
import { bookmarksToHtml } from './bookmark-html';
import { libraryTree } from './bookmark-tree';
import { loginsToCsv } from './login-csv';
import type { Transfer } from './transfer';
import { branchOf, trailToMarkdown } from './trail-markdown';

/** Past this, a file isn't an export of anything Splash can read. */
const MAX_IMPORT_FILE = 256 * 1024 * 1024;

const todayStamp = () => new Date().toISOString().slice(0, 10);

/** Asks where, and writes there. Resolves to the file's name, `null` if none. */
async function saveAs(
  parent: BaseWindow,
  options: {
    title: string;
    name: string;
    filters: { name: string; extensions: string[] }[];
    text: string;
    mode?: number;
  },
): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: options.title,
    defaultPath: options.name,
    filters: options.filters,
  });
  if (canceled || !filePath) return null;
  await writeFile(filePath, options.text, {
    encoding: 'utf8',
    ...(options.mode ? { mode: options.mode } : {}),
  });
  return path.basename(filePath);
}

export function exportBookmarks(
  parent: BaseWindow,
  preferences: Pick<PreferencesService, 'get'>,
): Promise<string | null> {
  return saveAs(parent, {
    title: 'Export Bookmarks',
    name: `Splash Bookmarks ${todayStamp()}.html`,
    filters: [{ name: 'Bookmarks file', extensions: ['html'] }],
    text: bookmarksToHtml(libraryTree(preferences.get().collections)),
  });
}

/** The active page's whole trail, from its first page down. */
export function exportTrail(
  parent: BaseWindow,
  controller: BrowserController,
): Promise<string | null> {
  const { pages } = controller.exportSession();
  const byId = new Map(pages.map((page) => [page.id, page]));
  let root = controller.activePageId ? byId.get(controller.activePageId) : null;
  while (root?.parentId && byId.has(root.parentId)) {
    root = byId.get(root.parentId)!;
  }
  if (!root) return Promise.resolve(null);
  const title = root.customTitle || root.title || root.url || 'Trail';
  const safeName = title
    .replace(/[/\\:*?"<>|]/g, ' ')
    .trim()
    .slice(0, 80);
  return saveAs(parent, {
    title: 'Export Trail',
    name: `${safeName || 'Trail'}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    text: trailToMarkdown(title, branchOf(pages, root.id)),
  });
}

/** Passwords leave in the open, so this says so, and asks for Touch ID first. */
export async function exportPasswords(
  parent: BaseWindow,
  vault: Pick<Vault, 'logins'>,
  authorize: (reason: string) => Promise<boolean>,
): Promise<string | null> {
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    message: 'Export your passwords as plain text?',
    detail:
      'Anyone or any app that can read the file can read every password in it. Delete it once you’ve imported it elsewhere.',
    buttons: ['Cancel', 'Export…'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response !== 1) return null;
  if (!(await authorize('export your saved passwords'))) return null;
  return saveAs(parent, {
    title: 'Export Passwords',
    name: `Splash Passwords ${todayStamp()}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    text: loginsToCsv(vault.logins()),
    mode: 0o600,
  });
}

/** Asks for a file another browser exported, and brings it in. */
export async function importChosenFile(
  parent: BaseWindow,
  transfer: Transfer,
): Promise<ImportResult | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: 'Import Bookmarks, History or Passwords',
    message:
      'Choose a bookmarks file (.html, .json), a Safari export (.zip, .plist) or a passwords file (.csv).',
    filters: [
      {
        name: 'Browser exports',
        extensions: ['html', 'htm', 'json', 'csv', 'plist', 'zip'],
      },
    ],
    properties: ['openFile'],
  });
  const file = filePaths[0];
  if (canceled || !file) return null;
  if (statSync(file).size > MAX_IMPORT_FILE) {
    return {
      summary: `“${path.basename(file)}” is too large to be a browser export.`,
      details: [],
      undoToken: null,
      trashToken: null,
    };
  }
  return transfer.importFile(file, readFileSync(file));
}
