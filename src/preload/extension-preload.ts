/*
 * Runs in every frame of the web session. The library adds the Chrome
 * extension APIs Electron lacks (toolbar actions, context menus, tabs,
 * navigation events) to extension pages; the rest of this file keeps them.
 */
// Before the library, which replaces what this reads.
import { headersReceived } from './native-web-request';
import 'electron-chrome-extensions/preload';
import { contextBridge } from 'electron';
import { emptyManagedStorage } from './managed-storage';
import { addSidePanel } from './side-panel';

/*
 * On extension pages, Electron replaces `chrome` after preloads run,
 * dropping what the library added. Carry the library's APIs over to each
 * new `chrome`, replacing Electron's own versions where the library wraps
 * them, except `webRequest` (see below). Runs in the page's main world, so
 * it must not use anything from outside the function.
 */
function keepExtensionApis(): void {
  if (location.protocol !== 'chrome-extension:') return;
  const augmented: Record<string, unknown> = Reflect.get(globalThis, 'chrome');
  let current = augmented;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set(next: Record<string, unknown> | undefined) {
      if (!next || next === augmented) return;
      for (const key of Object.keys(augmented)) {
        // The library's `webRequest` swaps `onHeadersReceived` for an event
        // its main side never fires, so no extension saw a response: not
        // uBlock Origin's header filters, not Splash's helper extension.
        // Electron's own works.
        if (key === 'webRequest') continue;
        const own = Object.getOwnPropertyDescriptor(augmented, key);
        // The library defines its APIs as read-only values.
        if (!own || !('value' in own) || own.writable) continue;
        try {
          Object.defineProperty(next, key, {
            value: own.value,
            enumerable: true,
            configurable: true,
          });
        } catch (error) {
          console.warn(`Couldn’t add chrome.${key}`, error);
        }
      }
      current = next;
    },
  });
}

// Background pages have no context isolation; extension pages opened as
// Splash pages do, and there the library's APIs live in the main world.
if (process.contextIsolated) {
  contextBridge.executeInMainWorld({ func: emptyManagedStorage });
  // Before `keepExtensionApis`, which carries over what's on `chrome` by then.
  contextBridge.executeInMainWorld({ func: addSidePanel });
  contextBridge.executeInMainWorld({ func: keepExtensionApis });
} else {
  // `chrome` is frozen by now, but the library's `webRequest` object isn't.
  const webRequest: unknown = Reflect.get(
    Reflect.get(globalThis, 'chrome') ?? {},
    'webRequest',
  );
  if (headersReceived && webRequest && typeof webRequest === 'object') {
    Reflect.set(webRequest, 'onHeadersReceived', headersReceived);
  }
  emptyManagedStorage();
  addSidePanel();
  keepExtensionApis();
}
