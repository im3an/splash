import path from 'node:path';

/**
 * File types that can run code when opened. Splash still saves them, but
 * warns and asks before opening one.
 */
const RUNNABLE_EXTENSIONS = new Set([
  'app',
  'command',
  'tool',
  'sh',
  'bash',
  'zsh',
  'csh',
  'ksh',
  'pkg',
  'mpkg',
  'jar',
  'workflow',
  'terminal',
  'scpt',
  'applescript',
  'action',
  'exe',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'vbs',
]);

export function isRunnableFile(filename: string): boolean {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return RUNNABLE_EXTENSIONS.has(extension);
}

/** Strips path separators and control characters from a suggested name. */
export function safeFileName(name: string): string {
  const cleaned = name
    // Control characters are exactly what this removes.
    // oxlint-disable-next-line no-control-regex
    .replace(/[/\\:\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 200) || 'download';
}

/**
 * A path in `directory` that doesn't exist yet: `report.pdf`, then
 * `report 2.pdf`, `report 3.pdf`, the way Finder names copies.
 */
export function uniqueFilePath(
  directory: string,
  filename: string,
  exists: (candidate: string) => boolean,
): string {
  const name = safeFileName(filename);
  const extension = path.extname(name);
  const base = name.slice(0, name.length - extension.length) || 'download';
  let candidate = path.join(directory, name);
  for (let copy = 2; exists(candidate); copy++) {
    candidate = path.join(directory, `${base} ${copy}${extension}`);
  }
  return candidate;
}
