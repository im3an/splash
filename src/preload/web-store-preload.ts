/*
 * Gives the Chrome Web Store the private APIs behind its "Add" button. The
 * library's own check only tests that the address starts with the store's, so
 * `chromewebstore.google.com.evil.example` would get them too and could remove
 * extensions. Runs in every frame of the web session; only the exact origin
 * loads it.
 */
import { webFrame } from 'electron';

/**
 * The store's "Switch to Chrome" banner and dialog. The library rewrites the
 * banner's button to "Install Splash", though it leads to Chrome's download.
 * These match by Chrome's name and address, not the wording, which is
 * translated; if the store changes, the nag comes back and nothing else breaks.
 */
const CHROME_NAG = `
  section > div:has(button[aria-label*="Chrome"]):not(:has(h1)),
  [role="dialog"]:has(a[href*="google.com/chrome/"]) {
    display: none !important;
  }
`;

if (location.origin === 'https://chromewebstore.google.com') {
  webFrame.insertCSS(CHROME_NAG);
  require('electron-chrome-web-store/preload');
}
