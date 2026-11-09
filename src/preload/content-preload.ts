/*
 * Runs in an isolated world in every page and frame of the web session. It
 * reports the page's classes and ids so the main process can hide ads that
 * match; the hiding itself is injected from there. It also runs DuckDuckGo's
 * autoconsent, which rejects cookie banners with rules from the main process.
 */
import '@ghostery/adblocker-electron-preload';
import AutoConsent from '@duckduckgo/autoconsent';
import { ipcRenderer } from 'electron';
import {
  AUTOCONSENT,
  FORM_ASK,
  FORM_CLOSED,
  FORM_DISMISS,
  FORM_FILL,
  FORM_KEY,
  FORM_STILL_LOGIN,
  FORM_SUBMITTED,
  type FormFill,
} from '../shared/page-bridge';
import { installFormAssist } from './form-assist';
import { settings } from './site-settings';

const consent: AutoConsent = new AutoConsent(async (message) => {
  const reply = await ipcRenderer.invoke(AUTOCONSENT, message);
  if (reply) await consent.receiveMessageCallback(reply);
});

if (settings?.formAssist) {
  const assist = installFormAssist({
    ask: (report) => ipcRenderer.invoke(FORM_ASK, report) as Promise<boolean>,
    dismiss: () => ipcRenderer.send(FORM_DISMISS),
    key: (key) => ipcRenderer.send(FORM_KEY, key),
    submitted: (credentials) => ipcRenderer.send(FORM_SUBMITTED, credentials),
    stillLogin: () => ipcRenderer.send(FORM_STILL_LOGIN),
  });
  ipcRenderer.on(FORM_FILL, (_event, fill: FormFill) => assist.fill(fill));
  ipcRenderer.on(FORM_CLOSED, () => assist.closed());
}
