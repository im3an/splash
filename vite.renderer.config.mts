import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The renderer ships a strict CSP. In development, Vite's React refresh
 * preamble is an inline script and HMR needs a websocket, so the policy is
 * relaxed only for `vite serve`.
 */
function contentSecurityPolicy(): Plugin {
  let isDev = false;
  return {
    name: 'splash-csp',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'";
      const connectSrc = isDev ? "'self' ws://localhost:*" : "'self'";
      const policy = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        // Favicons come from the pages being browsed.
        "img-src 'self' data: https: http:",
        "font-src 'self'",
        `connect-src ${connectSrc}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
      ].join('; ');
      return html.replace('%CSP%', policy);
    },
  };
}

export default defineConfig({
  plugins: [contentSecurityPolicy(), react(), tailwindcss()],
  // Packaging output must not trigger dev-server reloads.
  server: { watch: { ignored: ['**/out/**'] } },
});
