import { page } from '../test-fixtures';
import {
  addressParts,
  describeError,
  displayUrl,
  filterListsSummary,
  formatBytes,
  pageLabel,
  pageParts,
  permissionNames,
  securityOf,
  urlParts,
} from './format';

describe('displayUrl', () => {
  it('drops the scheme and bare root path of secure URLs', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com');
    expect(displayUrl('https://example.com/a?b=1#c')).toBe(
      'example.com/a?b=1#c',
    );
  });

  it('keeps insecure URLs explicit', () => {
    expect(displayUrl('http://example.com/')).toBe('http://example.com/');
  });
});

describe('pageLabel', () => {
  it('identifies a source page even before Chromium supplies a title', () => {
    expect(
      pageLabel(
        page('a', { title: '', url: 'view-source:https://example.com/' }),
      ),
    ).toBe('Source · example.com');
  });
  it('prefers the title, then the host, then a placeholder', () => {
    expect(pageLabel(page('a', { title: 'Docs' }))).toBe('Docs');
    expect(pageLabel(page('a', { title: '  ', url: 'https://x.dev/p' }))).toBe(
      'x.dev',
    );
    expect(pageLabel(page('a', { title: '', url: null }))).toBe('New page');
  });
});

describe('pageParts', () => {
  const parts = (title: string, url: string | null, customTitle?: string) =>
    pageParts(page('a', { title, url, customTitle: customTitle ?? null }));

  it('splits a trailing site name off the title', () => {
    expect(
      parts('Matcha - Wikipedia', 'https://en.wikipedia.org/wiki/Matcha'),
    ).toEqual({ title: 'Matcha', site: 'Wikipedia' });
    expect(
      parts('tokyo tower - Google Search', 'https://www.google.de/search'),
    ).toEqual({ title: 'tokyo tower', site: 'Google Search' });
    expect(
      parts(
        'Taylor Swift - Patient Zero (Official Music Video) - YouTube',
        'https://www.youtube.com/watch?v=1',
      ),
    ).toEqual({
      title: 'Taylor Swift - Patient Zero (Official Music Video)',
      site: 'YouTube',
    });
    expect(parts('Front page | BBC News', 'https://www.bbc.co.uk/')).toEqual({
      title: 'Front page',
      site: 'BBC News',
    });
  });

  it('splits a leading site name off the title', () => {
    expect(
      parts('GitHub - im3an/splash: A browser', 'https://github.com/im3an'),
    ).toEqual({ title: 'im3an/splash: A browser', site: 'GitHub' });
  });

  it('strips a site name from both ends at once', () => {
    expect(
      parts(
        'GitHub - electron/electron: Build desktop apps · GitHub',
        'https://github.com/electron/electron',
      ),
    ).toEqual({
      title: 'electron/electron: Build desktop apps',
      site: 'GitHub',
    });
  });

  it('falls back to the short host', () => {
    expect(parts('Pricing', 'https://www.example.com/p')).toEqual({
      title: 'Pricing',
      site: 'example.com',
    });
    expect(parts('Mine', 'https://x.com/', 'Renamed')).toEqual({
      title: 'Renamed',
      site: 'x.com',
    });
  });

  it('adds nothing when the title is only the site name or there is no site', () => {
    expect(parts('(12) YouTube', 'https://www.youtube.com/')).toEqual({
      title: '(12) YouTube',
      site: null,
    });
    expect(parts('', 'https://x.dev/p')).toEqual({
      title: 'x.dev',
      site: null,
    });
    expect(parts('', 'https://www.youtube.com/')).toEqual({
      title: 'www.youtube.com',
      site: null,
    });
    expect(parts('', null)).toEqual({ title: 'New page', site: null });
  });
});

describe('addressParts', () => {
  it('pairs the short host with the page title', () => {
    expect(
      addressParts(
        page('a', {
          title: 'Patient Zero - YouTube',
          url: 'https://www.youtube.com/watch?v=1',
        }),
      ),
    ).toEqual({ host: 'youtube.com', title: 'Patient Zero' });
    expect(
      addressParts(page('a', { title: '', url: 'https://x.dev/' })),
    ).toEqual({ host: 'x.dev', title: null });
  });

  it('leaves non-web addresses as they are', () => {
    expect(addressParts(page('a', { url: 'file:///tmp/a.html' }))).toBeNull();
    expect(addressParts(page('a', { url: null }))).toBeNull();
  });
});

describe('urlParts', () => {
  it('splits a full address around its host', () => {
    expect(urlParts('https://www.youtube.com/watch?v=1')).toEqual({
      scheme: 'https://',
      host: 'www.youtube.com',
      rest: '/watch?v=1',
    });
    expect(urlParts('http://localhost:5173/')).toEqual({
      scheme: 'http://',
      host: 'localhost:5173',
      rest: '/',
    });
  });

  it('gives nothing for addresses without a host', () => {
    expect(urlParts('about:blank')).toBeNull();
    expect(urlParts('not a url')).toBeNull();
  });
});

describe('securityOf', () => {
  it('classifies URLs by protocol', () => {
    expect(securityOf('https://a.com')).toBe('secure');
    expect(securityOf('http://a.com')).toBe('insecure');
    expect(securityOf(null)).toBe('none');
  });
});

describe('describeError', () => {
  it('explains known network failures', () => {
    const { detail } = describeError({
      kind: 'load-failed',
      code: -105,
      description: 'ERR_NAME_NOT_RESOLVED',
      url: 'https://nope.invalid/',
    });
    expect(detail).toMatch(/Check the spelling/);
    expect(
      describeError({
        kind: 'load-failed',
        code: -105,
        description: 'ERR_NAME_NOT_RESOLVED',
        url: 'https://nope.invalid/',
      }).title,
    ).toBe('Couldn’t find nope.invalid');
    expect(
      describeError({
        kind: 'load-failed',
        code: -106,
        description: 'ERR_INTERNET_DISCONNECTED',
        url: 'https://example.com/',
      }).detail,
    ).toBe(
      'Couldn’t reach example.com. Check your connection, then try again.',
    );
  });

  it('treats the -2xx range as certificate errors', () => {
    const { detail } = describeError({
      kind: 'load-failed',
      code: -202,
      description: 'ERR_CERT_AUTHORITY_INVALID',
      url: 'https://self-signed.example/',
    });
    expect(detail).toMatch(/certificate/);
  });

  it('describes crashes separately', () => {
    expect(
      describeError({
        kind: 'crashed',
        code: 1,
        description: 'crashed',
        url: '',
      }).title,
    ).toBe('This page stopped working');
  });
});

describe('permissionNames', () => {
  it('lists permissions in plain language', () => {
    expect(permissionNames(['camera'])).toBe('camera');
    expect(permissionNames(['camera', 'microphone'])).toBe(
      'camera and microphone',
    );
    expect(permissionNames(['camera', 'microphone', 'location'])).toBe(
      'camera, microphone and location',
    );
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1_500)).toBe('1.5 KB');
    expect(formatBytes(12_300_000)).toBe('12 MB');
    expect(formatBytes(3_200_000_000)).toBe('3.2 GB');
  });
});

describe('filterListsSummary', () => {
  const NOW = 100 * 24 * 60 * 60 * 1000;
  const ready = { state: 'ready' as const, updateFailed: false };

  it('says how old the lists are', () => {
    expect(filterListsSummary({ ...ready, updatedAt: NOW - 1000 }, NOW)).toBe(
      'Updated today. Splash updates them every week.',
    );
    expect(
      filterListsSummary({ ...ready, updatedAt: NOW - 3.5 * 86_400_000 }, NOW),
    ).toBe('Updated 3 days ago. Splash updates them every week.');
  });

  it('says when nothing can be blocked yet, or an update failed', () => {
    expect(
      filterListsSummary(
        { state: 'failed', updatedAt: null, updateFailed: true },
        NOW,
      ),
    ).toMatch(/nothing is blocked yet/);
    expect(
      filterListsSummary(
        { ...ready, updatedAt: NOW - 86_400_000, updateFailed: true },
        NOW,
      ),
    ).toBe(
      'Updated yesterday. Couldn’t download newer lists; these stay in use.',
    );
  });
});
