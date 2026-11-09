import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { app, dialog, shell, type Session } from 'electron';
import { pageHandleFor } from '../browser/electron-page-host';
import type { PreferencesService } from '../preferences';
import type { TrailStore } from '../storage/trail-store';
import { DownloadManager } from './download-manager';
import { quarantineDownload } from './quarantine';

/** The download manager, wired to the browsing session and macOS. */
export function createDownloadManager(
  session: Session,
  store: TrailStore,
  preferences: PreferencesService,
): DownloadManager {
  const onDownload = (
    event: Electron.Event,
    item: Electron.DownloadItem,
    contents: Electron.WebContents,
  ) => {
    const page = pageHandleFor(contents);
    if (page?.downloadStarting(item.getURL(), item.getFilename()) === false) {
      event.preventDefault();
      return;
    }
    manager.track(item, page?.pageId ?? null);
    item.once('done', (_done, state) => {
      if (state === 'completed') void quarantineDownload(item.getSavePath());
    });
  };
  const manager = new DownloadManager({
    onDispose: () => {
      session.removeListener('will-download', onDownload);
    },
    store,
    downloadsFolder: () => app.getPath('downloads'),
    askWhereToSave: () => preferences.get().downloads === 'ask',
    exists: existsSync,
    restart: (url) => session.downloadURL(url),
    openFile: async (path) => {
      const problem = await shell.openPath(path);
      if (problem) console.warn(`Could not open ${path}: ${problem}`);
    },
    showFile: (path) => shell.showItemInFolder(path),
    confirmOpenRunnable: async (download) => {
      const host = (() => {
        try {
          return new URL(download.url).host;
        } catch {
          return 'this site';
        }
      })();
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        message: `Open “${download.filename}”?`,
        detail: `This kind of file can run programs and change your Mac. Open it only if you trust ${host}.`,
        buttons: ['Open', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      return response === 0;
    },
    createId: randomUUID,
    now: Date.now,
  });
  session.on('will-download', onDownload);
  return manager;
}
