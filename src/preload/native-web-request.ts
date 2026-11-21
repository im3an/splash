/*
 * Electron's own `chrome.webRequest.onHeadersReceived`, read before
 * electron-chrome-extensions replaces it (this module is imported first). The
 * library swaps in an event its main side never fires, so no extension would
 * see a response: not uBlock Origin's header filters, not Splash's helper
 * extension. extension-preload.ts puts this one back.
 */
function nativeHeadersReceived(): unknown {
  if (globalThis.location?.protocol !== 'chrome-extension:') return undefined;
  const chrome: unknown = Reflect.get(globalThis, 'chrome');
  const webRequest: unknown =
    chrome && typeof chrome === 'object'
      ? Reflect.get(chrome, 'webRequest')
      : undefined;
  return webRequest && typeof webRequest === 'object'
    ? Reflect.get(webRequest, 'onHeadersReceived')
    : undefined;
}

export const headersReceived = nativeHeadersReceived();
