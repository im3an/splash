/*
 * The extensions library answers `chrome.storage.managed` with local storage.
 * uBlock Origin caches what managed storage returns inside local storage, so
 * every launch nested the whole store in itself, about 57 MB more each time,
 * until Electron crashed shortly after launch. Nothing sets policy for
 * extensions in Splash, so managed storage is empty, as it is in Chrome.
 *
 * Runs in the page's main world, so it must not use anything from outside the
 * function.
 */
export function emptyManagedStorage(): void {
  if (location.protocol !== 'chrome-extension:') return;
  const api: {
    runtime?: { getManifest(): { name?: string }; lastError?: unknown };
    storage?: {
      local?: { remove(key: string, done: () => void): unknown };
      managed?: unknown;
    };
  } = Reflect.get(globalThis, 'chrome');
  const storage = api.storage;
  if (!storage) return;

  storage.managed = {
    get(...args: unknown[]) {
      const done = args[args.length - 1];
      if (typeof done === 'function') done({});
      return Promise.resolve({});
    },
    getBytesInUse(...args: unknown[]) {
      const done = args[args.length - 1];
      if (typeof done === 'function') done(0);
      return Promise.resolve(0);
    },
    onChanged: {
      addListener() {},
      removeListener() {},
      hasListener: () => false,
    },
  };

  // Profiles that already grew: drop the cache before uBlock reads it. uBlock
  // rebuilds it, now empty, so its filters and settings are untouched.
  if (
    location.pathname === '/background.html' &&
    api.runtime?.getManifest().name === 'uBlock Origin'
  ) {
    storage.local?.remove('cachedManagedStorage', () => {
      void api.runtime?.lastError;
    });
  }
}
