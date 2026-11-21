// Builds Splash's helper extension (src/helper-extension) into
// `extensions/splash-helper`, next to the extensions fetched by
// fetch-extensions.mjs, so it's packaged the same way. Runs before
// `npm start` and before packaging.
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'helper-extension');
const TARGET = path.join(ROOT, 'extensions', 'splash-helper');

await build({
  configFile: false,
  logLevel: 'warn',
  root: ROOT,
  build: {
    outDir: TARGET,
    emptyOutDir: true,
    // Readable in the field: it's small, and bug reports quote it.
    minify: false,
    lib: {
      entry: path.join(SOURCE, 'background.ts'),
      formats: ['iife'],
      name: 'splashHelperExtension',
      fileName: () => 'background.js',
    },
  },
});
copyFileSync(
  path.join(SOURCE, 'manifest.json'),
  path.join(TARGET, 'manifest.json'),
);
