import { canBranchLink } from '../shared/branch-click';
import { ipcRenderer } from 'electron';
import {
  BRANCH_LINK,
  FORM_EDITED,
  LINK_ACTIVATED,
  NAVIGATION_BUTTON,
} from '../shared/page-bridge';

/*
 * Runs in an isolated world inside every web page. It exposes nothing to the
 * page and only reports genuine, unmodified link clicks so the main process
 * can branch the trail. Modified clicks (⌘, ⇧, ⌥, ⌃) keep Chromium's own
 * behaviour: new page, download, and so on. It also passes on a mouse's back
 * and forward buttons, which Chromium leaves to the browser.
 */

function linkTarget(event: MouseEvent): string | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) {
      return node.hasAttribute('download') ? null : node.href;
    }
    if (node instanceof SVGAElement) {
      try {
        return new URL(node.href.baseVal, document.baseURI).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Preloads also run in iframes; only the page itself reports clicks.
if (window === window.top) {
  window.addEventListener(
    'click',
    (event) => {
      const modified =
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!event.isTrusted || event.button !== 0 || modified) return;
      const href = linkTarget(event);
      if (href) ipcRenderer.send(LINK_ACTIVATED, href);
    },
    { capture: true },
  );
}

// Wait for document-level routers to handle the click first. Eligible normal
// links become child pages directly, avoiding Chromium's beforeunload step on
// the source document (which stays open). Named targets keep native behavior.
if (window === window.top)
  window.addEventListener('click', (event) => {
    if (
      !event.isTrusted ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const href = linkTarget(event);
    if (!href) return;
    const anchor = event
      .composedPath()
      .find(
        (node) =>
          node instanceof HTMLAnchorElement ||
          node instanceof HTMLAreaElement ||
          node instanceof SVGAElement,
      );
    const target =
      anchor instanceof Element ? (anchor.getAttribute('target') ?? '') : '';
    if (!canBranchLink(location.href, href, target, event.defaultPrevented))
      return;
    event.preventDefault();
    ipcRenderer.send(BRANCH_LINK, href);
  });

// Every frame listens, so the buttons work over embedded videos and maps too.
window.addEventListener(
  'mouseup',
  (event) => {
    if (!event.isTrusted) return;
    if (event.button === 3) ipcRenderer.send(NAVIGATION_BUTTON, 'back');
    if (event.button === 4) ipcRenderer.send(NAVIGATION_BUTTON, 'forward');
  },
  { capture: true },
);

// Keep edited documents awake. Only an event flag crosses the boundary, never
// field values, names, credentials or other content, including inside frames.
let reportedEdits = false;
for (const type of ['input', 'change'])
  window.addEventListener(
    type,
    (event) => {
      if (!event.isTrusted || reportedEdits) return;
      reportedEdits = true;
      ipcRenderer.send(FORM_EDITED, true);
    },
    { capture: true },
  );
