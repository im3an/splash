/// <reference types="chrome" />
/**
 * The background page of Splash's helper extension. Main loads it into every
 * browsing session and calls `self.splashHelper` to keep its settings current
 * (see src/main/privacy/protection.ts).
 */
import { HelperRules } from './rules';

const rules = new HelperRules();
const all = { urls: ['<all_urls>'] };

chrome.webRequest.onBeforeRequest.addListener(
  (details) => rules.beforeRequest(details),
  all,
  ['blocking'],
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const requestHeaders = rules.beforeSendHeaders(details);
    return requestHeaders ? { requestHeaders } : undefined;
  },
  all,
  // Cookie and Sec- headers are only visible, and changeable, with this.
  ['blocking', 'requestHeaders', 'extraHeaders'],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const responseHeaders = rules.headersReceived(details);
    return responseHeaders ? { responseHeaders } : undefined;
  },
  all,
  ['blocking', 'responseHeaders', 'extraHeaders'],
);

chrome.webRequest.onResponseStarted.addListener(
  (details) => rules.responseStarted(details),
  all,
);

chrome.tabs?.onRemoved?.addListener((tabId) => rules.tabClosed(tabId));

declare global {
  // Main's way in, through `executeJavaScript` on this page.
  var splashHelper: HelperRules;
}
self.splashHelper = rules;
