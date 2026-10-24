import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SplashApi } from '../shared/api';
import { App } from './App';
import { connectShell } from './connect';
import './styles/app.css';

/**
 * In the app the preload script provides `window.splash`. Opened in a plain
 * browser (`npm run dev:web`), the shell runs against simulated pages.
 */
async function backend(): Promise<SplashApi> {
  if (window.splash) return window.splash;
  const { createMockBackend } = await import('./mock/mock-backend');
  window.splash = createMockBackend();
  return window.splash;
}

void backend().then((splash) => {
  connectShell(splash);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
