import { FiltersEngine } from '@ghostery/adblocker';
import { runInNewContext } from 'node:vm';
import {
  bundleScriptlets,
  ContentBlocker,
  COOKIE_NOTICE_LISTS,
  isConsentPage,
  LIST_MAX_AGE,
  type BlockerOptions,
} from './content-blocker';

const NOW = 1_000_000_000;
const LIST = [
  '||ads.example^',
  '||tags.example/gpt.js$script,redirect=googletagservices_gpt.js',
  '||tags.example/pixel.gif$image,redirect=1x1.gif',
  '$removeparam=s_cid',
  '$removeparam=fbclid',
  '$removeparam=gclid',
  '||shop.example^$doc,removeparam=ref_campaign',
  'news.example##.banner',
  'news.example##+js(set-cookie, consent, yes)',
].join('\n');

function setup(
  cache: Uint8Array | null = null,
  savedAt = NOW,
  options?: BlockerOptions,
) {
  const fetch = vi.fn(async (url: string) => {
    const text = url.endsWith('resources.json') ? '[]' : LIST;
    return {
      text: async () => text,
      json: async () => JSON.parse(text),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  });
  const source = {
    readCache: vi.fn(async () => (cache ? { data: cache, savedAt } : null)),
    writeCache: vi.fn(async () => undefined),
    fetch,
    now: () => NOW,
  };
  return { blocker: new ContentBlocker(source, options), source };
}

describe('ContentBlocker', () => {
  it('hides nothing until the lists have loaded', () => {
    const { blocker } = setup();
    expect(blocker.cosmeticsFor('https://news.example/')).toBeNull();
    expect(blocker.getStatus().state).toBe('loading');
  });

  it('downloads the lists and saves them', async () => {
    const { blocker, source } = setup();
    await blocker.load();
    expect(source.writeCache).toHaveBeenCalledOnce();
    expect(blocker.getStatus()).toEqual({
      state: 'ready',
      updatedAt: NOW,
      updateFailed: false,
    });
  });

  it('returns hiding rules for the page’s site', async () => {
    const { blocker } = setup();
    await blocker.load();
    expect(blocker.cosmeticsFor('https://news.example/')?.styles).toContain(
      '.banner',
    );
    expect(blocker.cosmeticsFor('https://other.example/')?.styles).toBe('');
  });

  it('starts from saved lists without downloading', async () => {
    const saved = FiltersEngine.parse(LIST).serialize();
    const { blocker, source } = setup(saved);
    await blocker.load();
    expect(source.fetch).not.toHaveBeenCalled();
    expect(blocker.cosmeticsFor('https://news.example/')?.styles).toContain(
      '.banner',
    );
  });

  it('downloads again when the saved lists are a week old', async () => {
    const saved = FiltersEngine.parse(LIST).serialize();
    const { blocker, source } = setup(saved, NOW - LIST_MAX_AGE);
    await blocker.load();
    expect(source.fetch).toHaveBeenCalled();
  });

  it('keeps old lists working when an update fails', async () => {
    const saved = FiltersEngine.parse(LIST).serialize();
    const { blocker, source } = setup(saved);
    await blocker.load();
    source.fetch.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(blocker.update()).rejects.toThrow('offline');
    expect(blocker.getStatus()).toMatchObject({
      state: 'ready',
      updateFailed: true,
    });
    expect(blocker.cosmeticsFor('https://news.example/')?.styles).toContain(
      '.banner',
    );
  });

  it('reports a failed first download', async () => {
    const { blocker, source } = setup();
    source.fetch.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(blocker.load()).rejects.toThrow('offline');
    expect(blocker.getStatus().state).toBe('failed');
  });

  it('downloads only the cookie notice lists, and no scriptlets', async () => {
    const { blocker, source } = setup();
    await blocker.load();
    const urls = source.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual(COOKIE_NOTICE_LISTS);
  });
});

describe('scriptlets', () => {
  it('runs a list’s scriptlets only when they are turned on', async () => {
    const resources = JSON.stringify({
      scriptlets: [
        {
          name: 'set-cookie.js',
          aliases: [],
          body: 'function setCookie() {}',
          dependencies: [],
        },
      ],
      redirects: [],
    });
    const withScriptlets = setup(null, NOW, { scriptlets: true });
    const without = setup();
    for (const { source } of [withScriptlets, without]) {
      source.fetch.mockImplementation(async (url: string) => {
        const text = url.endsWith('resources.json') ? resources : LIST;
        return {
          text: async () => text,
          json: async () => JSON.parse(text),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      });
    }
    await withScriptlets.blocker.load();
    await without.blocker.load();
    const url = 'https://news.example/';
    expect(
      withScriptlets.blocker.cosmeticsFor(url)?.scripts.join(''),
    ).toContain('setCookie');
    const cosmetics = without.blocker.cosmeticsFor(url);
    expect(cosmetics?.scripts).toEqual([]);
    expect(cosmetics?.styles).toContain('.banner');
  });
});

describe('isConsentPage', () => {
  it('knows pages that only ask for cookie consent', () => {
    expect(
      isConsentPage('https://consent.google.com/m?continue=https://x.example/'),
    ).toBe(true);
    expect(isConsentPage('https://consent.google.de/ml')).toBe(true);
    expect(isConsentPage('https://consent.youtube.com/m')).toBe(true);
  });

  it('leaves every other page to the cookie lists', () => {
    expect(isConsentPage('https://www.google.com/')).toBe(false);
    expect(isConsentPage('https://consent.example/')).toBe(false);
    expect(isConsentPage('https://news.example/consent.html')).toBe(false);
    expect(isConsentPage(null)).toBe(false);
  });
});

describe('COOKIE_NOTICE_LISTS', () => {
  it('names the cookie lists and nothing else', () => {
    expect(COOKIE_NOTICE_LISTS).toHaveLength(2);
    for (const url of COOKIE_NOTICE_LISTS) expect(url).toMatch(/cookie/);
  });
});

describe('bundleScriptlets', () => {
  // The shape of uBlock Origin's proxyApplyFn: a helper declared at the top
  // level whose toString wrapper looks itself up by name when called.
  const scriptlet = `
    function wrapToString() {
      if (wrapToString.native) return;
      wrapToString.native = Function.prototype.toString;
      Function.prototype.toString = new Proxy(Function.prototype.toString, {
        apply(_target, self) { return wrapToString.native.call(self); },
      });
    }
    wrapToString();
  `;
  const probe = 'Function.prototype.toString.call(Math.max)';

  it('keeps helpers of separate scriptlets from calling each other', () => {
    const page = {};
    runInNewContext(scriptlet, page);
    runInNewContext(scriptlet, page);
    // Run one after another, the second overwrites the first's helper.
    expect(() => runInNewContext(probe, page)).toThrow(/call stack/);

    const bundled = {};
    runInNewContext(bundleScriptlets([scriptlet, scriptlet])!, bundled);
    expect(runInNewContext(probe, bundled)).toContain('native code');
    expect('wrapToString' in bundled).toBe(false);
  });

  it('runs the rest when one scriptlet throws', () => {
    const page: { ran?: boolean } = {};
    runInNewContext(
      bundleScriptlets(['throw new Error("broken")', 'globalThis.ran = true'])!,
      page,
    );
    expect(page.ran).toBe(true);
  });

  it('has nothing to run without scriptlets', () => {
    expect(bundleScriptlets([])).toBeNull();
  });
});
