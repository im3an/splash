import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_LISTENER,
  extensionOfFrame,
  MESSAGE,
  patternCoversHost,
  REMOTE,
  REMOVE_LISTENER,
  resetGuardForTests,
  withGuardedExtensionIpc,
  type Manifest,
} from './extension-ipc-guard';

const UBLOCK = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';
const VAULT = 'nngceckbapebfimnlniiiahkandclblb';

type Handler = (...args: unknown[]) => unknown;

/** A stand-in for `ipcMain` that records what's registered on it. */
function fakeIpc() {
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Handler>();
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler);
    },
    on(channel: string, handler: Handler) {
      listeners.set(channel, handler);
      return ipc;
    },
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    removeAllListeners(channel: string) {
      listeners.delete(channel);
      return ipc;
    },
  };
  return { ipc, handlers, listeners };
}

/** What the library registers, with spies in place of its routing. */
function libraryBuild(ipc: ReturnType<typeof fakeIpc>['ipc']) {
  const routed = vi.fn(async (_event: unknown, _id: unknown, name: unknown) =>
    name === 'cookies.getAll'
      ? [
          { name: 'a', domain: '.example.com', secure: true },
          { name: 'b', domain: 'bank.test', secure: true },
        ]
      : 'ok',
  );
  const remote = vi.fn(() => 'remote-ok');
  const added = vi.fn();
  const removed = vi.fn();
  return {
    routed,
    remote,
    added,
    removed,
    build: () => {
      ipc.handle(MESSAGE, routed as never);
      ipc.handle(REMOTE, remote as never);
      ipc.on(ADD_LISTENER, added as never);
      ipc.on(REMOVE_LISTENER, removed as never);
      return 'library';
    },
  };
}

function eventFrom(
  origin: string | null,
  manifests: Record<string, Manifest> = {},
) {
  return {
    senderFrame: origin === null ? null : { origin },
    sender: {
      session: {
        extensions: {
          getExtension: (id: string) =>
            manifests[id] ? { manifest: manifests[id]! } : null,
        },
      },
    },
  };
}

function setUp(fromShell = false) {
  resetGuardForTests();
  const fake = fakeIpc();
  const library = libraryBuild(fake.ipc);
  const built = withGuardedExtensionIpc(
    fake.ipc as never,
    { fromShell: () => fromShell },
    library.build,
  );
  return { ...fake, ...library, built };
}

afterEach(() => {
  resetGuardForTests();
  vi.restoreAllMocks();
});

describe('extensionOfFrame', () => {
  it('reads the id from an extension origin only', () => {
    expect(extensionOfFrame({ origin: `chrome-extension://${UBLOCK}` })).toBe(
      UBLOCK,
    );
    expect(extensionOfFrame({ origin: 'https://example.com' })).toBeNull();
    expect(extensionOfFrame({ origin: 'null' })).toBeNull();
    expect(extensionOfFrame(null)).toBeNull();
  });
});

describe('patternCoversHost', () => {
  it('follows Chrome match patterns', () => {
    expect(patternCoversHost('<all_urls>', 'https', 'a.test')).toBe(true);
    expect(patternCoversHost('*://*/*', 'http', 'a.test')).toBe(true);
    expect(
      patternCoversHost('https://*.example.com/*', 'https', 'example.com'),
    ).toBe(true);
    expect(
      patternCoversHost('https://*.example.com/*', 'https', 'www.example.com'),
    ).toBe(true);
    expect(
      patternCoversHost('https://*.example.com/*', 'https', 'badexample.com'),
    ).toBe(false);
    expect(
      patternCoversHost('https://*.example.com/*', 'http', 'example.com'),
    ).toBe(false);
    expect(
      patternCoversHost('https://example.com/*', 'https', 'www.example.com'),
    ).toBe(false);
    expect(
      patternCoversHost('https://example.com:8443/*', 'https', 'example.com'),
    ).toBe(true);
    expect(patternCoversHost('storage', 'https', 'example.com')).toBe(false);
  });
});

describe('withGuardedExtensionIpc', () => {
  it('returns what the library built and restores ipcMain', () => {
    const fake = fakeIpc();
    const { handle, on } = fake.ipc;
    const library = libraryBuild(fake.ipc);
    expect(
      withGuardedExtensionIpc(
        fake.ipc as never,
        { fromShell: () => false },
        library.build,
      ),
    ).toBe('library');
    expect(fake.ipc.handle).toBe(handle);
    expect(fake.ipc.on).toBe(on);
    expect([...fake.handlers.keys()]).toEqual([MESSAGE, REMOTE]);
  });

  it('passes a message from the extension it names', async () => {
    const { handlers, routed } = setUp();
    const event = eventFrom(`chrome-extension://${UBLOCK}`);
    await expect(
      handlers.get(MESSAGE)!(event, UBLOCK, 'tabs.query', {}),
    ).resolves.toBe('ok');
    expect(routed).toHaveBeenCalledWith(event, UBLOCK, 'tabs.query', {});
  });

  it('refuses a web page that names an extension', async () => {
    const { handlers, routed } = setUp();
    const event = eventFrom('https://evil.test');
    await expect(
      handlers.get(MESSAGE)!(event, VAULT, 'runtime.sendNativeMessage', 'x'),
    ).rejects.toThrow(/Refused/);
    expect(routed).not.toHaveBeenCalled();
  });

  it('refuses one extension naming another', async () => {
    const { handlers, routed } = setUp();
    const event = eventFrom(`chrome-extension://${UBLOCK}`);
    await expect(
      handlers.get(MESSAGE)!(event, VAULT, 'tabs.create', {}),
    ).rejects.toThrow(/Refused/);
    await expect(
      handlers.get(MESSAGE)!(event, undefined, 'browserAction.getState'),
    ).rejects.toThrow(/Refused/);
    expect(routed).not.toHaveBeenCalled();
  });

  it('refuses a frame that is already gone', async () => {
    const { handlers } = setUp();
    await expect(
      handlers.get(MESSAGE)!(eventFrom(null), UBLOCK, 'tabs.query', {}),
    ).rejects.toThrow(/Refused/);
  });

  it('answers remote calls from Splash only', async () => {
    const page = setUp(false);
    expect(() =>
      page.handlers.get(REMOTE)!(
        eventFrom('https://evil.test'),
        '_self',
        'browserAction.activate',
      ),
    ).toThrow(/Refused/);
    expect(page.remote).not.toHaveBeenCalled();
    const shell = setUp(true);
    expect(
      shell.handlers.get(REMOTE)!(
        eventFrom('app://splash'),
        '_self',
        'browserAction.getState',
      ),
    ).toBe('remote-ok');
  });

  it('adds listeners only for the sending extension', () => {
    const { listeners, added, removed } = setUp();
    listeners.get(ADD_LISTENER)!(
      eventFrom('https://evil.test'),
      UBLOCK,
      'tabs.onUpdated',
    );
    listeners.get(REMOVE_LISTENER)!(
      eventFrom('https://evil.test'),
      UBLOCK,
      'tabs.onUpdated',
    );
    expect(added).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    const own = eventFrom(`chrome-extension://${UBLOCK}`, { [UBLOCK]: {} });
    listeners.get(ADD_LISTENER)!(own, UBLOCK, 'tabs.onUpdated');
    expect(added).toHaveBeenCalledOnce();
  });

  it('keeps cookie changes from extensions without the permission', () => {
    const { listeners, added } = setUp();
    listeners.get(ADD_LISTENER)!(
      eventFrom(`chrome-extension://${UBLOCK}`, {
        [UBLOCK]: { permissions: ['storage'] },
      }),
      UBLOCK,
      'cookies.onChanged',
    );
    expect(added).not.toHaveBeenCalled();
    listeners.get(ADD_LISTENER)!(
      eventFrom(`chrome-extension://${VAULT}`, {
        [VAULT]: { permissions: ['cookies'] },
      }),
      VAULT,
      'cookies.onChanged',
    );
    expect(added).toHaveBeenCalledOnce();
  });

  describe('cookies', () => {
    const call = async (manifest: Manifest, name: string, details: unknown) => {
      const { handlers, routed } = setUp();
      const event = eventFrom(`chrome-extension://${VAULT}`, {
        [VAULT]: manifest,
      });
      const result = handlers.get(MESSAGE)!(event, VAULT, name, details);
      return { result: result as Promise<unknown>, routed };
    };

    it('need the cookies permission', async () => {
      const { result, routed } = await call(
        { permissions: ['<all_urls>'] },
        'cookies.getAll',
        {},
      );
      await expect(result).rejects.toThrow(/cookies permission/);
      expect(routed).not.toHaveBeenCalled();
    });

    it('come back only for sites the extension can reach (MV3)', async () => {
      const { result } = await call(
        {
          permissions: ['cookies'],
          host_permissions: ['https://*.example.com/*'],
        },
        'cookies.getAll',
        {},
      );
      await expect(result).resolves.toEqual([
        { name: 'a', domain: '.example.com', secure: true },
      ]);
    });

    it('read MV2 host patterns from the permissions', async () => {
      const { result } = await call(
        { permissions: ['cookies', '<all_urls>'] },
        'cookies.getAll',
        {},
      );
      await expect(result).resolves.toHaveLength(2);
    });

    it('keep a secure cookie from an http-only pattern', async () => {
      const { result } = await call(
        { permissions: ['cookies', 'http://*/*'] },
        'cookies.getAll',
        {},
      );
      await expect(result).resolves.toEqual([]);
    });

    it('set and remove only on reachable sites', async () => {
      const manifest = { permissions: ['cookies', 'https://example.com/*'] };
      await expect(
        (
          await call(manifest, 'cookies.set', {
            url: 'https://bank.test/',
            name: 'x',
          })
        ).result,
      ).rejects.toThrow(/can't reach/);
      await expect(
        (
          await call(manifest, 'cookies.remove', {
            url: 'javascript:alert(1)',
            name: 'x',
          })
        ).result,
      ).rejects.toThrow(/can't reach/);
      await expect(
        (
          await call(manifest, 'cookies.set', {
            url: 'https://example.com/',
            name: 'x',
          })
        ).result,
      ).resolves.toBe('ok');
    });
  });

  it('refuses channels it does not know', () => {
    const fake = fakeIpc();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    withGuardedExtensionIpc(
      fake.ipc as never,
      { fromShell: () => false },
      () => {
        fake.ipc.handle(MESSAGE, (() => 'ok') as never);
        fake.ipc.handle(REMOTE, (() => 'ok') as never);
        fake.ipc.on(ADD_LISTENER, (() => undefined) as never);
        fake.ipc.on(REMOVE_LISTENER, (() => undefined) as never);
        fake.ipc.handle('crx-new-thing', (() => 'ok') as never);
        fake.ipc.handle('unrelated', (() => 'ok') as never);
      },
    );
    expect(fake.handlers.has('crx-new-thing')).toBe(false);
    expect(fake.handlers.has('unrelated')).toBe(true);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('crx-new-thing'),
    );
  });

  it('removes channels registered before it could guard them', () => {
    const fake = fakeIpc();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    fake.handlers.set(MESSAGE, () => 'unguarded');
    withGuardedExtensionIpc(
      fake.ipc as never,
      { fromShell: () => false },
      () => null,
    );
    expect(fake.handlers.has(MESSAGE)).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it('guards only the first build, which registers the handlers', () => {
    const first = setUp();
    const build = vi.fn(() => 'second');
    expect(
      withGuardedExtensionIpc(
        first.ipc as never,
        { fromShell: () => false },
        build,
      ),
    ).toBe('second');
    expect(build).toHaveBeenCalledOnce();
  });
});
