import { beforeEach, describe, expect, it } from 'vitest';
import {
  CookieViewer,
  groupCookies,
  siteOf,
  type CookieJar,
  type StoredCookie,
} from './cookies';

function cookie(overrides: Partial<StoredCookie>): StoredCookie {
  return {
    name: 'id',
    value: 'secret-value',
    domain: '.example.com',
    hostOnly: false,
    path: '/',
    secure: true,
    httpOnly: false,
    session: false,
    expirationDate: 2_000_000_000,
    sameSite: 'lax',
    ...overrides,
  };
}

describe('siteOf', () => {
  it('finds the registrable site', () => {
    expect(siteOf('.www.example.co.uk')).toBe('example.co.uk');
    expect(siteOf('mail.Example.com')).toBe('example.com');
  });

  it('keeps sites on shared hosting apart', () => {
    expect(siteOf('alice.github.io')).toBe('alice.github.io');
  });

  it('keeps bare hosts and addresses as they are', () => {
    expect(siteOf('localhost')).toBe('localhost');
    expect(siteOf('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('groupCookies', () => {
  it('groups by site, biggest first, and never includes values', () => {
    const sites = groupCookies([
      cookie({ domain: 'small.org' }),
      cookie({ domain: '.example.com', name: 'a' }),
      cookie({ domain: 'www.example.com', name: 'b', session: true }),
    ]);
    expect(sites.map((site) => site.site)).toEqual([
      'example.com',
      'small.org',
    ]);
    expect(JSON.stringify(sites)).not.toContain('secret-value');
    expect(sites[0]!.cookies[0]!.expires).toBe(2_000_000_000_000);
    expect(sites[0]!.cookies[1]!.expires).toBeNull();
  });
});

describe('CookieViewer', () => {
  let stored: StoredCookie[];
  let now: number;
  let viewer: CookieViewer;
  const jar: CookieJar = {
    get: async () => stored,
    remove: async (url, name) => {
      const { hostname, protocol, pathname } = new URL(url);
      stored = stored.filter(
        (item) =>
          !(
            item.name === name &&
            item.domain?.replace(/^\./, '') === hostname &&
            item.path === pathname &&
            item.secure === (protocol === 'https:')
          ),
      );
    },
    set: async (details) => {
      stored.push(
        cookie({
          ...details,
          domain: details.domain ?? new URL(details.url).hostname,
          hostOnly: details.domain === undefined,
        }),
      );
    },
    flushStore: async () => undefined,
  };

  beforeEach(() => {
    now = 1000;
    stored = [
      cookie({ name: 'a' }),
      cookie({ name: 'b', domain: 'www.example.com', hostOnly: true }),
      cookie({ name: 'other', domain: 'other.org' }),
    ];
    viewer = new CookieViewer({
      jar,
      now: () => now,
      createToken: () => 'token',
    });
  });

  it('lists one site by any of its hosts', async () => {
    const sites = await viewer.list('shop.example.com');
    expect(sites.map((site) => site.site)).toEqual(['example.com']);
  });

  it('deletes a whole site and leaves others alone', async () => {
    const result = await viewer.delete('example.com');
    expect(result.deleted).toBe(2);
    expect(stored.map((item) => item.name)).toEqual(['other']);
  });

  it('deletes one cookie', async () => {
    await viewer.delete('example.com', {
      name: 'a',
      domain: '.example.com',
      path: '/',
    });
    expect(stored.map((item) => item.name)).toEqual(['b', 'other']);
  });

  it('offers no undo when nothing was deleted', async () => {
    expect(await viewer.delete('nothing.net')).toEqual({
      deleted: 0,
      undoToken: null,
    });
  });

  it('brings cookies back, host-only ones still host-only', async () => {
    const { undoToken } = await viewer.delete('example.com');
    expect(await viewer.restore(undoToken!)).toBe(true);
    expect(stored).toHaveLength(3);
    const restored = stored.find((item) => item.name === 'b');
    expect(restored?.hostOnly).toBe(true);
    expect(restored?.value).toBe('secret-value');
  });

  it('forgets expired cookie values even if the wall clock moves back', async () => {
    vi.useFakeTimers();
    try {
      const { undoToken } = await viewer.delete('example.com');
      await vi.advanceTimersByTimeAsync(60_001);
      expect(await viewer.restore(undoToken!)).toBe(false);
      expect(stored).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards undo values and timers with the profile', async () => {
    vi.useFakeTimers();
    try {
      const { undoToken } = await viewer.delete('example.com');
      expect(vi.getTimerCount()).toBe(1);
      viewer.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(await viewer.restore(undoToken!)).toBe(false);
      expect(await viewer.delete('other.org')).toEqual({
        deleted: 0,
        undoToken: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a late or repeated undo', async () => {
    const first = await viewer.delete('example.com');
    now += 60_001;
    expect(await viewer.restore(first.undoToken!)).toBe(false);
    expect(await viewer.restore(first.undoToken!)).toBe(false);
    expect(stored).toHaveLength(1);
  });
});
