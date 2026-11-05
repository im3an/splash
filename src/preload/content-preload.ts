/*
 * Runs in an isolated world in every page and frame of the web session. It
 * reports the page's classes and ids so the main process can hide ads that
 * match; the hiding itself is injected from there. It also runs DuckDuckGo's
 * autoconsent, which rejects cookie banners with rules from the main process.
 */
import '@ghostery/adblocker-electron-preload';
import AutoConsent from '@duckduckgo/autoconsent';
import { ipcRenderer } from 'electron';
import { AUTOCONSENT } from '../shared/page-bridge';
import './site-settings';

const consent: AutoConsent = new AutoConsent(async (message) => {
  const reply = await ipcRenderer.invoke(AUTOCONSENT, message);
  if (reply) await consent.receiveMessageCallback(reply);
});
