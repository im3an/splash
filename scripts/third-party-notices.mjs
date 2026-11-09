// Writes the licence of every package Splash ships into one file, which the
// app shows in Settings › About and the build puts inside the app. Runs before
// `npm start` and before packaging, so the list follows package-lock.json.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'build', 'third-party-notices.txt');
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;
const RULE = '-'.repeat(72);

const lock = JSON.parse(
  readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'),
);

/** Shipped packages: everything in the lock that isn't for development only. */
const packages = Object.entries(lock.packages)
  .filter(([where, entry]) => where && !entry.dev && !entry.devOptional)
  .map(([where]) => where)
  // Type declarations are compiled away; they don't ship.
  .filter((where) => !where.includes('node_modules/@types/'))
  .sort((a, b) => name(a).localeCompare(name(b)));

function name(where) {
  return where.slice(
    where.lastIndexOf('node_modules/') + 'node_modules/'.length,
  );
}

function licenceText(folder) {
  const file = readdirSync(folder).find((entry) => LICENCE_FILE.test(entry));
  return file ? readFileSync(path.join(folder, file), 'utf8').trim() : null;
}

const seen = new Set();
const sections = [];
for (const where of packages) {
  const folder = path.join(ROOT, where);
  if (!existsSync(path.join(folder, 'package.json'))) continue;
  const manifest = JSON.parse(
    readFileSync(path.join(folder, 'package.json'), 'utf8'),
  );
  const id = `${manifest.name}@${manifest.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const licence =
    typeof manifest.license === 'string'
      ? manifest.license
      : (manifest.license?.type ?? 'See below');
  const text = licenceText(folder);
  sections.push(
    [
      RULE,
      `${id}`,
      `Licence: ${licence}`,
      manifest.homepage ? `Home: ${manifest.homepage}` : null,
      '',
      text ??
        `No licence file is included with this package. Its licence is ${licence}.`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  );
}

// One line per paragraph: Settings shows it in a box that wraps by itself.
const header = [
  'Splash includes the following open-source software.',
  'uBlock Origin, by Raymond Hill and contributors, is included under the GNU General Public License, version 3. Splash ships it with its cookie-notice filter lists removed and its list catalogue fixed. Its source code is at https://github.com/gorhill/uBlock, and its licence is in the app at Contents/Resources/extensions/ublock-origin/LICENSE.txt.',
  'Electron and Chromium are included under the MIT licence and the licences listed in LICENSES.chromium.html, inside the app at Contents/Resources.',
  'The JavaScript packages below are built into Splash.',
].join('\n\n');

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}\n\n${sections.join('\n\n')}\n`);
console.log(
  `Wrote the licences of ${sections.length} packages to ${path.relative(ROOT, OUT)}`,
);
