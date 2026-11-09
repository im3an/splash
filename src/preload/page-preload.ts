import { canBranchLink, droppedLink } from '../shared/branch-click';
import { ipcRenderer, webUtils } from 'electron';
import {
  BRANCH_LINK,
  FILE_DROPPED,
  FORM_EDITED,
  FRAME_GESTURE,
  LINK_ACTIVATED,
  LINK_DROPPED,
  NAVIGATION_BUTTON,
  VIDEO_UNFLOATED,
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

// The floating window's close button pauses its video; its back button leaves
// it playing. The pause arrives just after the event, so this waits a moment.
document.addEventListener(
  'leavepictureinpicture',
  (event) => {
    const video = event.target as HTMLVideoElement;
    setTimeout(() => ipcRenderer.send(VIDEO_UNFLOATED, !video.paused), 100);
  },
  { capture: true },
);

// A click in an embedded frame may open something; the main process can't see
// input to a frame from another site, so the frame says it happened.
if (window !== window.top) {
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(
      type,
      (event) => {
        if (event.isTrusted) ipcRenderer.send(FRAME_GESTURE);
      },
      { capture: true },
    );
  }
}

// A link dragged in from elsewhere opens beneath this page. Listening last, on
// the way back up, leaves a site's own drop zones and text fields their drops.
// A drag that began here is the page's own business, however it ends.
let draggingFromHere = false;
window.addEventListener('dragstart', () => (draggingFromHere = true), {
  capture: true,
});
window.addEventListener('dragend', () => (draggingFromHere = false), {
  capture: true,
});

function acceptsLink(event: DragEvent): boolean {
  if (!event.isTrusted || event.defaultPrevented || draggingFromHere) {
    return false;
  }
  if (!event.dataTransfer?.types.includes('text/uri-list')) return false;
  const target = event.target;
  return !(
    target instanceof Element &&
    target.closest('input, textarea, [contenteditable]')
  );
}

/** A file dragged in from the Finder: same rules, in the top frame only. */
function acceptsFile(event: DragEvent): boolean {
  if (!event.isTrusted || event.defaultPrevented || draggingFromHere) {
    return false;
  }
  if (window !== window.top) return false;
  if (!event.dataTransfer?.types.includes('Files')) return false;
  const target = event.target;
  return !(
    target instanceof Element &&
    target.closest('input, textarea, [contenteditable]')
  );
}

window.addEventListener('dragover', (event) => {
  if (acceptsLink(event) || acceptsFile(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (acceptsFile(event)) {
    event.preventDefault();
    const paths = [...event.dataTransfer!.files]
      .map((file) => webUtils.getPathForFile(file))
      .filter(Boolean)
      .slice(0, 50);
    if (paths.length > 0) ipcRenderer.send(FILE_DROPPED, paths);
    return;
  }
  if (!acceptsLink(event)) return;
  event.preventDefault();
  const href = droppedLink(event.dataTransfer!.getData('text/uri-list'));
  if (href) ipcRenderer.send(LINK_DROPPED, href);
});

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
