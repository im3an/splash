/*
 * Runs in every frame of the web session. The library adds the Chrome
 * extension APIs Electron lacks (toolbar actions, context menus, tabs,
 * navigation events) to extension pages; the rest of this file keeps them.
 */
import 'electron-chrome-extensions/preload';
import { contextBridge } from 'electron';

/*
 * On extension pages, Electron replaces `chrome` after preloads run,
 * dropping what the library added. Carry the library's APIs over to each
 * new `chrome`, replacing Electron's own versions: its `webRequest` and
 * others are the ones the library wraps. Runs in the page's main world, so
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
  contextBridge.executeInMainWorld({ func: keepExtensionApis });
} else {
  keepExtensionApis();
}
