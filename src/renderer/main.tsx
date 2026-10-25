import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, ShellCrashed } from './components/ErrorBoundary';
import { SettingsApp } from './settings/SettingsApp';
import { api } from './splash-api';
import { connectDownloads } from './stores/downloads-store';
import { connectShell } from './stores/shell-store';
import './styles/app.css';

connectShell(api());
connectDownloads(api());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={() => <ShellCrashed />}>
      {location.hash === '#settings' ? <SettingsApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
