import { BrowsingDataCleaner, rangeStart } from './browsing-data';

const NOW = 10_000_000;

function setup() {
  const store = {
    deleteHistory: vi.fn((since: number) =>
      since > 0
        ? [
            {
              url: 'https://a.example/',
              title: 'A',
              visitCount: 1,
              lastVisitedAt: NOW - 10,
            },
          ]
        : [],
    ),
    restoreHistory: vi.fn(),
    clearPermissions: vi.fn(),
  };
  let now = NOW;
  const options = {
    store,
    clearSiteData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
    clearDownloadList: vi.fn(),
    now: () => now,
    createToken: () => 'token',
  };
  return {
    cleaner: new BrowsingDataCleaner(options),
    options,
    store,
    advance: (ms: number) => (now += ms),
  };
}

const NONE = {
  range: 'hour' as const,
  history: false,
  cookies: false,
  cache: false,
  permissions: false,
  downloads: false,
};

describe('BrowsingDataCleaner', () => {
  it('clears history for the chosen range and can undo it', async () => {
    const { cleaner, store } = setup();
    const result = await cleaner.clear({ ...NONE, history: true });
    expect(store.deleteHistory).toHaveBeenCalledWith(rangeStart('hour', NOW));
    expect(result).toEqual({
      summary: 'Cleared history from the last hour.',
      undoToken: 'token',
    });
    expect(cleaner.restore('token')).toBe(true);
    expect(store.restoreHistory).toHaveBeenCalledOnce();
    expect(cleaner.restore('token')).toBe(false);
  });

  it('lets the undo expire', async () => {
    const { cleaner, advance, store } = setup();
    await cleaner.clear({ ...NONE, history: true });
    advance(61_000);
    expect(cleaner.restore('token')).toBe(false);
    expect(store.restoreHistory).not.toHaveBeenCalled();
  });

  it('clears everything else for all time and says what it did', async () => {
    const { cleaner, options, store } = setup();
    const result = await cleaner.clear({
      range: 'all',
      history: false,
      cookies: true,
      cache: true,
      permissions: true,
      downloads: true,
    });
    expect(options.clearSiteData).toHaveBeenCalled();
    expect(options.clearCache).toHaveBeenCalled();
    expect(store.clearPermissions).toHaveBeenCalled();
    expect(options.clearDownloadList).toHaveBeenCalled();
    expect(result.summary).toBe(
      'Cleared cookies and site data, cached files, site permissions and the download list.',
    );
    expect(result.undoToken).toBeNull();
  });

  it('offers no undo when there was no history to clear', async () => {
    const { cleaner } = setup();
    const result = await cleaner.clear({
      ...NONE,
      range: 'all',
      history: true,
    });
    expect(result.undoToken).toBeNull();
  });
});
