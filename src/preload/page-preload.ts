import { ipcRenderer } from 'electron';
import { LINK_ACTIVATED } from '../shared/page-bridge';

/*
 * Runs in an isolated world inside every web page. It exposes nothing to the
 * page and only reports genuine, unmodified link clicks so the main process
 * can branch the trail. Modified clicks (⌘, ⇧, ⌥, ⌃) keep Chromium's own
 * behaviour: new page, download, and so on.
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
