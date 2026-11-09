import { defineConfig } from 'vite';

// electron-chrome-web-store looks for its preload under this exact name next
// to the main bundle when node_modules isn't packaged.
export default defineConfig({
  build: {
    rollupOptions: {
      output: { entryFileNames: 'chrome-web-store.preload.js' },
    },
  },
});
