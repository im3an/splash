import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where the shell UI is served from: the Vite dev server or the app bundle. */
export function shellUrl(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const file = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  return pathToFileURL(file).href;
}

/** Whether `candidate` is the shell document (any hash), not some other page. */
export function isSameDocument(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    return b.protocol === 'file:'
      ? a.protocol === 'file:' && a.pathname === b.pathname
      : a.origin === b.origin;
  } catch {
    return false;
  }
}
