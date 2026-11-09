import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

/** Far beyond any real extension; an archive claiming more is refused. */
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

/** Where an entry belongs under `root`; `null` if it would leave it. */
export function entryPath(root: string, name: string): string | null {
  if (name.includes('\\') || name.includes('\0') || path.isAbsolute(name)) {
    return null;
  }
  const target = path.resolve(root, name);
  return target.startsWith(path.resolve(root) + path.sep) ? target : null;
}

/**
 * Stands in for adm-zip, through an alias in vite.main.config.mts, in the one
 * thing electron-chrome-web-store asks of it: unpacking a downloaded extension.
 *
 * Everything an archive says is distrusted. Each entry is written as a plain
 * file with default permissions, so a symlink entry is only a small text file
 * and setuid bits are dropped. Inflating stops at each entry's declared size,
 * and the declared sizes together have a limit.
 */
export default class SafeZip {
  constructor(private readonly archive: Uint8Array) {}

  extractAllTo(destination: string, _overwrite?: boolean): void {
    let total = 0;
    const files = unzipSync(this.archive, {
      filter: ({ originalSize }) => {
        total += originalSize;
        if (total > MAX_UNPACKED_BYTES) {
          throw new Error('The extension’s archive is too large to unpack.');
        }
        return true;
      },
    });
    // Checked before anything is written, so a bad archive leaves nothing.
    const entries = Object.entries(files).map(([name, data]) => {
      const target = entryPath(destination, name);
      if (!target) {
        throw new Error(`The extension’s archive has a bad path: ${name}`);
      }
      return { target, data, folder: name.endsWith('/') };
    });
    for (const { target, data, folder } of entries) {
      if (folder) {
        mkdirSync(target, { recursive: true });
      } else {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, data);
      }
    }
  }
}
