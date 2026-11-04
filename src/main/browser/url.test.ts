import {
  allowExtensionPages,
  allowLocalFile,
  isExternalAppUrl,
  isLocalFileUrl,
  isNavigableUrl,
  isPageUrl,
  localFileUrl,
  mayFollowFileLink,
  mayOpenFromPage,
  resolveAddressInput,
  searchUrl,
} from './url';

describe('resolveAddressInput', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['example.com/path?q=1', 'https://example.com/path?q=1'],
    ['sub.example.co.uk', 'https://sub.example.co.uk/'],
    ['https://example.com/a', 'https://example.com/a'],
    ['view-source:https://example.com/', 'view-source:https://example.com/'],
    ['http://example.com', 'http://example.com/'],
    ['localhost:5173', 'http://localhost:5173/'],
    ['127.0.0.1:8080/x', 'http://127.0.0.1:8080/x'],
    ['example.com:8443', 'https://example.com:8443/'],
    ['  example.com  ', 'https://example.com/'],
  ])('treats %s as an address', (input, expected) => {
    expect(resolveAddressInput(input)).toBe(expected);
  });

  it.each([
    'how do trails work',
    'electron',
    'what is 1.5',
    'example.com is down',
    'file:///etc/passwd',
    'javascript://alert(1)',
    'chrome://settings',
  ])('turns %s into a search', (input) => {
    expect(resolveAddressInput(input)).toBe(searchUrl(input.trim()));
  });

  it('never produces a non-web URL', () => {
    for (const input of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'about:blank',
    ]) {
      expect(isNavigableUrl(resolveAddressInput(input))).toBe(true);
    }
  });
});

describe('isNavigableUrl', () => {
  it('accepts only http and https', () => {
    expect(isNavigableUrl('https://a.com')).toBe(true);
    expect(isNavigableUrl('http://a.com')).toBe(true);
    expect(isNavigableUrl('file:///tmp')).toBe(false);
    expect(isNavigableUrl('mailto:a@b.c')).toBe(false);
    expect(isNavigableUrl('not a url')).toBe(false);
  });
});

describe('isPageUrl', () => {
  it('allows web pages and the pages of bundled extensions only', () => {
    allowExtensionPages('bundledextensionid');
    expect(isPageUrl('https://example.com/')).toBe(true);
    expect(
      isPageUrl('chrome-extension://bundledextensionid/dashboard.html'),
    ).toBe(true);
    expect(isPageUrl('chrome-extension://otherextension/options.html')).toBe(
      false,
    );
    expect(isPageUrl('file:///etc/hosts')).toBe(false);
  });

  it('never lets typed input reach an extension page', () => {
    allowExtensionPages('bundledextensionid');
    expect(
      resolveAddressInput('chrome-extension://bundledextensionid/x.html'),
    ).toMatch(/^https:\/\/duckduckgo\.com\//);
  });
});

describe('mayOpenFromPage', () => {
  it('lets sites open web pages and source, never extension pages', () => {
    allowExtensionPages('bundledextensionid');
    expect(mayOpenFromPage('https://example.com/')).toBe(true);
    expect(mayOpenFromPage('view-source:https://example.com/')).toBe(true);
    expect(
      mayOpenFromPage(
        'chrome-extension://bundledextensionid/asset-viewer.html?url=x',
      ),
    ).toBe(false);
    expect(mayOpenFromPage('file:///etc/hosts')).toBe(false);
    expect(mayOpenFromPage('javascript:alert(1)')).toBe(false);
  });
});

describe('search engines', () => {
  it('searches with the chosen engine', () => {
    expect(resolveAddressInput('trail maps', 'google')).toBe(
      'https://www.google.com/search?q=trail%20maps',
    );
    expect(searchUrl('a&b', 'brave')).toBe(
      'https://search.brave.com/search?q=a%26b',
    );
  });
});

it('permits source inspection only for web addresses', () => {
  expect(isPageUrl('view-source:https://example.com/')).toBe(true);
  expect(isPageUrl('view-source:http://localhost/')).toBe(true);
  for (const address of [
    'view-source:file:///etc/hosts',
    'view-source:javascript:alert(1)',
    'view-source:chrome://settings',
    'view-source:view-source:https://example.com/',
  ]) {
    expect(isPageUrl(address)).toBe(false);
  }
});

describe('local files', () => {
  it('refuses every file until the user has opened it', () => {
    expect(isPageUrl('file:///Users/me/never-opened.html')).toBe(false);
    allowLocalFile('file:///Users/me/opened.html');
    expect(isPageUrl('file:///Users/me/opened.html')).toBe(true);
    expect(isPageUrl('file:///Users/me/opened.html#part')).toBe(true);
    expect(isPageUrl('file:///Users/me/never-opened.html')).toBe(false);
  });

  it('never lets a web page open one, even after it was opened', () => {
    allowLocalFile('file:///Users/me/shared.html');
    expect(mayOpenFromPage('file:///Users/me/shared.html')).toBe(false);
    expect(isNavigableUrl('file:///Users/me/shared.html')).toBe(false);
    expect(isExternalAppUrl('file:///Users/me/shared.html')).toBe(false);
  });

  it('ignores files on another machine', () => {
    expect(isLocalFileUrl('file://server/share/a.html')).toBe(false);
    allowLocalFile('file://server/share/a.html');
    expect(isPageUrl('file://server/share/a.html')).toBe(false);
  });

  it('lets an opened file link only to files in its own folder or below', () => {
    allowLocalFile('file:///Users/me/docs/index.html');
    const from = 'file:///Users/me/docs/index.html';
    expect(mayFollowFileLink(from, 'file:///Users/me/docs/two.html')).toBe(
      true,
    );
    expect(mayFollowFileLink(from, 'file:///Users/me/docs/a/b.html')).toBe(
      true,
    );
    expect(mayFollowFileLink(from, 'file:///Users/me/secret.html')).toBe(false);
    expect(
      mayFollowFileLink(from, 'file:///Users/me/docs/../secret.html'),
    ).toBe(false);
    expect(mayFollowFileLink(from, 'file:///Users/me/docs-2/a.html')).toBe(
      false,
    );
    expect(
      mayFollowFileLink(from, 'file:///Users/me/docs/..%2Fsecret.html'),
    ).toBe(false);
  });

  it('never lets a web page or an unopened file link to a file', () => {
    expect(
      mayFollowFileLink('https://example.com/', 'file:///Users/me/a.html'),
    ).toBe(false);
    expect(
      mayFollowFileLink('file:///Users/me/stranger.html', 'file:///Users/me/a'),
    ).toBe(false);
  });

  it('turns only files a page can show into addresses', () => {
    expect(localFileUrl('/Users/me/My Report.PDF')).toBe(
      'file:///Users/me/My%20Report.PDF',
    );
    expect(localFileUrl('/Users/me/#1.html')).toBe(
      'file:///Users/me/%231.html',
    );
    expect(localFileUrl('/Users/me/installer.dmg')).toBeNull();
    expect(localFileUrl('/Users/me/run.command')).toBeNull();
    expect(localFileUrl('/Users/me/no-extension')).toBeNull();
    expect(localFileUrl('relative/page.html')).toBeNull();
  });
});

describe('isExternalAppUrl', () => {
  it.each(['mailto:hi@example.com', 'tel:+4930123', 'zoommtg://zoom.us/join'])(
    'hands %s to another app',
    (url) => expect(isExternalAppUrl(url)).toBe(true),
  );

  it.each([
    'https://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'blob:https://example.com/x',
    'chrome://settings',
    'chrome-extension://abc/page.html',
    'view-source:https://example.com',
    'about:blank',
    'not a url',
    `mailto:${'a'.repeat(5000)}`,
  ])('never hands %s to another app', (url) =>
    expect(isExternalAppUrl(url)).toBe(false),
  );
});
