// Downloads the extensions Splash ships with into `extensions/`, checking
// each release against a pinned SHA-256, and applies Splash's changes to
// them. Runs before `npm start` and before packaging; does nothing when the
// right build is already there.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'extensions');
/** Records which release and which of Splash's changes a folder holds. */
const STAMP = '.splash-build';

/**
 * uBlock Origin's cookie-notice lists. Some of their rules click "Accept"
 * on pay-or-consent walls, and Splash never consents for the user; it hides
 * cookie banners itself. They're off by default; removing them means they
 * can't be switched on either.
 */
const UBLOCK_COOKIE_LISTS = [
  'adguard-cookies',
  'ublock-cookies-adguard',
  'fanboy-cookiemonster',
  'ublock-cookies-easylist',
];

function withoutCookieLists(folder) {
  const file = path.join(folder, 'assets', 'assets.json');
  const assets = JSON.parse(readFileSync(file, 'utf8'));
  for (const id of UBLOCK_COOKIE_LISTS) {
    if (!(id in assets)) throw new Error(`uBlock Origin has no list ${id}`);
    delete assets[id];
  }
  // uBlock Origin downloads a fresh catalog of lists now and then, which
  // would bring them back. Keep the bundled one; lists still update.
  assets['assets.json'].contentURL = ['assets/assets.json'];
  delete assets['assets.json'].cdnURLs;
  writeFileSync(file, `${JSON.stringify(assets, null, 4)}\n`);
}

const EXTENSIONS = [
  {
    // uBlock Origin, GPL-3.0, https://github.com/gorhill/uBlock
    folder: 'ublock-origin',
    version: '1.75.0',
    url: 'https://github.com/gorhill/uBlock/releases/download/1.75.0/uBlock0_1.75.0.chromium.zip',
    sha256: '393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582',
    /** The folder inside the zip that holds `manifest.json`. */
    root: 'uBlock0.chromium',
    /** Bump when `prepare` changes, so existing folders are rebuilt. */
    revision: 1,
    prepare: withoutCookieLists,
  },
];

function build(extension) {
  return `${extension.version}+${extension.revision}`;
}

function installedBuild(folder) {
  try {
    return readFileSync(path.join(ROOT, folder, STAMP), 'utf8').trim();
  } catch {
    return null;
  }
}

for (const extension of EXTENSIONS) {
  if (installedBuild(extension.folder) === build(extension)) continue;
  console.log(`Fetching ${extension.folder} ${extension.version}…`);
  const response = await fetch(extension.url);
  if (!response.ok) throw new Error(`${response.status} for ${extension.url}`);
  const zip = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(zip).digest('hex');
  if (hash !== extension.sha256) {
    throw new Error(
      `${extension.folder}: expected SHA-256 ${extension.sha256}, got ${hash}`,
    );
  }
  const work = mkdtempSync(path.join(tmpdir(), 'splash-extension-'));
  try {
    const file = path.join(work, 'extension.zip');
    writeFileSync(file, zip);
    execFileSync('unzip', ['-q', file, '-d', path.join(work, 'unpacked')]);
    const unpacked = path.join(work, 'unpacked', extension.root);
    extension.prepare?.(unpacked);
    writeFileSync(path.join(unpacked, STAMP), `${build(extension)}\n`);
    const target = path.join(ROOT, extension.folder);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    renameSync(unpacked, target);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
