import { basename } from 'node:path';
import { dialog, type BaseWindow, type WebContents } from 'electron';

const saving = new Set<number>();

/** Keep one save operation per page, with cancellation and recoverable failures. */
export async function savePage(
  window: BaseWindow,
  contents: WebContents,
  saved: (filename: string) => void,
): Promise<void> {
  if (contents.isDestroyed() || saving.has(contents.id)) return;
  const id = contents.id;
  saving.add(id);
  try {
    const title = (contents.getTitle() || 'Page')
      // Filenames must not contain filesystem separators or control characters.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .slice(0, 120);
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Page',
      defaultPath: `${title}.mhtml`,
      filters: [{ name: 'Web archive', extensions: ['mhtml'] }],
      message: 'Save this page and its resources together in one file.',
    });
    if (result.canceled || !result.filePath || contents.isDestroyed()) return;
    while (!contents.isDestroyed()) {
      try {
        await contents.savePage(result.filePath, 'MHTML');
        saved(basename(result.filePath));
        return;
      } catch {
        if (window.isDestroyed()) return;
        const response = await dialog.showMessageBox(window, {
          type: 'error',
          message: 'The page couldn’t be saved.',
          detail:
            'Check that the destination is available and has enough space, then try again. Your open page is unchanged.',
          buttons: ['Try Again', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response.response !== 0) return;
      }
    }
  } catch {
    if (!window.isDestroyed())
      await dialog
        .showMessageBox(window, {
          type: 'error',
          message: 'The save dialog couldn’t be opened.',
          detail: 'Your page is still open. Try Save Page As again.',
          buttons: ['OK'],
        })
        .catch(() => undefined);
  } finally {
    saving.delete(id);
  }
}
