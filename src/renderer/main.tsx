import { Authentication } from './components/Authentication';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, ShellCrashed } from './components/ErrorBoundary';
import { SettingsApp } from './settings/SettingsApp';
import { api } from './splash-api';
import { connectDownloads } from './stores/downloads-store';
import { connectShell } from './stores/shell-store';
import './styles/app.css';

const authentication = location.hash === '#authentication';
if (!authentication) {
  connectShell(api());
  connectDownloads(api());
}

if (location.hash === '#settings') document.title = 'Settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={() => <ShellCrashed />}>
      {authentication ? (
        <Authentication />
      ) : location.hash === '#settings' ? (
        <SettingsApp />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
