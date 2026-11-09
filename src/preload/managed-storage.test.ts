import { emptyManagedStorage } from './managed-storage';

type Stored = Record<string, unknown>;

function install({
  url = 'chrome-extension://abc/background.html',
  name = 'uBlock Origin',
  stored = { netWhitelist: 'example.com' } as Stored,
} = {}) {
  const local = {
    get: vi.fn(async () => stored),
    set: vi.fn(async () => undefined),
    remove: vi.fn((_key: string, done?: () => void) => done?.()),
  };
  const chromeApi = {
    runtime: { getManifest: () => ({ name }), lastError: undefined },
    // What the library installs: managed is local itself.
    storage: { local, sync: local, managed: local },
  };
  vi.stubGlobal('chrome', chromeApi);
  vi.stubGlobal('location', new URL(url));
  emptyManagedStorage();
  return { chromeApi, local };
}

afterEach(() => vi.unstubAllGlobals());

describe('emptyManagedStorage', () => {
  it('reports no policy instead of the extension’s own storage', async () => {
    const { chromeApi, local } = install();
    await expect(chromeApi.storage.managed.get()).resolves.toEqual({});
    expect(local.get).not.toHaveBeenCalled();
  });

  it('answers the callback form uBlock Origin uses', async () => {
    const { chromeApi } = install();
    const get = chromeApi.storage.managed.get as unknown as (
      done: (items: Stored) => void,
    ) => Promise<Stored>;
    const items = await new Promise((resolve) => void get(resolve));
    expect(items).toEqual({});
  });

  it('leaves local and sync storage alone', () => {
    const { chromeApi, local } = install();
    expect(chromeApi.storage.local).toBe(local);
    expect(chromeApi.storage.sync).toBe(local);
  });

  it('keeps change listeners working for extensions that add them', () => {
    const { chromeApi } = install();
    const managed = chromeApi.storage.managed as unknown as {
      onChanged: { addListener(run: () => void): void };
    };
    expect(() => managed.onChanged.addListener(() => undefined)).not.toThrow();
  });

  it('clears uBlock Origin’s runaway cache from its background page', () => {
    const { local } = install();
    expect(local.remove).toHaveBeenCalledTimes(1);
    expect(local.remove.mock.calls[0]?.[0]).toBe('cachedManagedStorage');
  });

  it.each([
    ['another extension', { name: 'Other Extension' }],
    ['another uBlock page', { url: 'chrome-extension://abc/popup.html' }],
  ])('keeps that key on %s', (_label, options) => {
    const { local } = install(options);
    expect(local.remove).not.toHaveBeenCalled();
  });

  it('does nothing on web pages', () => {
    const { chromeApi, local } = install({ url: 'https://example.com/' });
    expect(chromeApi.storage.managed).toBe(local);
    expect(local.remove).not.toHaveBeenCalled();
  });

  it('copes with pages that have no storage API', () => {
    vi.stubGlobal('chrome', {});
    vi.stubGlobal(
      'location',
      new URL('chrome-extension://abc/background.html'),
    );
    expect(() => emptyManagedStorage()).not.toThrow();
  });
});
