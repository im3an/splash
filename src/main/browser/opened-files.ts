import type { TrailStore } from '../storage/trail-store';
import { allowLocalFile, watchOpenedFiles } from './url';

const KEY = 'opened-files';

function savedFiles(saved: string | null): string[] {
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Keeps the files the user opened across restarts. A saved page's address is
 * never enough to reach a file on its own: it also has to be on this list,
 * which only choosing a file can add to.
 */
export function keepOpenedFiles(
  store: Pick<TrailStore, 'getPreference' | 'setPreference'>,
): void {
  savedFiles(store.getPreference(KEY)).forEach((url) => allowLocalFile(url));
  watchOpenedFiles((urls) => {
    try {
      store.setPreference(KEY, JSON.stringify(urls));
    } catch (error) {
      // The page still opens; it just won't come back after a restart.
      console.error('Could not save the list of opened files', error);
    }
  });
}
