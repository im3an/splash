import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
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
    ],
  },
});
