import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { CRX_SEAM } from './src/main/extensions/crx-verify';

/**
 * electron-chrome-web-store has no hook between downloading a package and
 * unpacking it, so its one reading of a download is rewritten to check the
 * signatures first. A library update that moves that line stops the build
 * rather than dropping the check.
 */
function checkStoreDownloads(): Plugin {
  const verifier = fileURLToPath(
    new URL('./src/main/extensions/crx-verify.ts', import.meta.url),
  );
  return {
    name: 'splash:check-store-downloads',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('electron-chrome-web-store/dist/cjs/browser/index.js')) {
        return null;
      }
      if (code.split(CRX_SEAM).length !== 2) {
        this.error(
          'electron-chrome-web-store changed how it reads downloads; move the signature check in crx-verify.ts.',
        );
      }
      return {
        code: code.replace(
          CRX_SEAM,
          `return require(${JSON.stringify(verifier)}).verifiedCrx(crxBuffer, parseCrx);`,
        ),
        map: null,
      };
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [checkStoreDownloads()],
  resolve: {
    alias: [
      {
        // Its ESM build has no `__dirname`, which it needs to find its
        // preload script; the CommonJS build works once bundled.
        find: /^electron-chrome-extensions$/,
        replacement: fileURLToPath(
          new URL(
            './node_modules/electron-chrome-extensions/dist/cjs/index.js',
            import.meta.url,
          ),
        ),
      },
      {
        // Keep extraction behind our bounded, path-checked implementation.
        // The web store library only uses adm-zip to unpack an archive.
        find: /^adm-zip$/,
        replacement: fileURLToPath(
          new URL('./src/main/extensions/safe-zip.ts', import.meta.url),
        ),
      },
      {
        // Like electron-chrome-extensions, for the same reason.
        find: /^electron-chrome-web-store$/,
        replacement: fileURLToPath(
          new URL(
            './node_modules/electron-chrome-web-store/dist/cjs/browser/index.js',
            import.meta.url,
          ),
        ),
      },
    ],
  },
});
