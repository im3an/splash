import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SettingsApp } from './settings/SettingsApp';
import { api } from './splash-api';
import { connectDownloads } from './stores/downloads-store';
import { connectShell } from './stores/shell-store';
import './styles/app.css';

connectShell(api());
connectDownloads(api());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#settings' ? <SettingsApp /> : <App />}
  </StrictMode>,
);
