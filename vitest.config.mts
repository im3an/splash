import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Main-process logic runs in Node; renderer tests opt into jsdom per file.
    environment: 'node',
  },
});
