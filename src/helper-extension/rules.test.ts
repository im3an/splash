import { HelperRules, type HelperSettings } from './rules';

const settings: HelperSettings = {
  privacySignal: true,
  blockThirdPartyCookies: true,
  httpsOnly: true,
  warnDangerousSites: true,
  identity: {
    chromeVersion: '142.0.7444.0',
    platform: 'macOS',
    platformVersion: '27.0.0',
    architecture: 'arm',
    bitness: '64',
  },
  decisions: {
    'https://scripts-off.example': { javascript: false, images: false },
    'http://plain.example': { insecure: true },
    'https://accepted.example': { dangerous: true },
  },
};

function rules(overrides: Partial<HelperSettings> = {}) {
  const helper = new HelperRules();
  helper.apply({ ...settings, ...overrides });
  helper.setDangerousHosts(['phish.example', 'accepted.example']);
  return helper;
}

const page = (url: string, tabId = 1) => ({ url, type: 'main_frame', tabId });

describe('before settings arrive', () => {
  it('lets every request through unchanged', () => {
    const helper = new HelperRules();
    expect(helper.beforeRequest(page('http://news.example/'))).toBeUndefined();
    expect(
      helper.beforeSendHeaders({
        ...page('https://news.example/'),
        requestHeaders: [],
      }),
    ).toBeUndefined();
  });
});

describe('a page’s address', () => {
  it('stops a reported site before anything leaves', () => {
    expect(rules().beforeRequest(page('https://www.phish.example/x'))).toEqual({
      cancel: true,
    });
  });

  it('lets a reported site through once the user accepted it', () => {
    expect(rules().beforeRequest(page('http://accepted.example/'))).toEqual({
      redirectUrl: 'https://accepted.example/',
    });
  });

  it('goes to HTTPS, unless the user chose HTTP for the site', () => {
    const helper = rules();
    expect(helper.beforeRequest(page('http://news.example/a'))).toEqual({
      redirectUrl: 'https://news.example/a',
    });
    expect(helper.beforeRequest(page('http://plain.example/'))).toBeUndefined();
    expect(
      helper.beforeRequest(page('http://www.plain.example/')),
    ).toBeUndefined();
    expect(
      rules({ httpsOnly: false }).beforeRequest(page('http://news.example/')),
    ).toBeUndefined();
  });

  it('lets a popup’s plain address through after its try at HTTPS failed', () => {
    const helper = rules();
    helper.allowPlain(7, 'http://news.example/');
    expect(
      helper.beforeRequest(page('http://news.example/', 7)),
    ).toBeUndefined();
    expect(helper.beforeRequest(page('http://news.example/', 8))).toEqual({
      redirectUrl: 'https://news.example/',
    });
  });

  it('leaves what a page loads alone', () => {
    expect(
      rules().beforeRequest({
        url: 'http://cdn.example/a.js',
        type: 'script',
        tabId: 1,
      }),
    ).toBeUndefined();
  });
});

describe('request headers', () => {
  it('carry the privacy signal and client hints', () => {
    const headers = rules().beforeSendHeaders({
      ...page('https://news.example/'),
      requestHeaders: [{ name: 'Accept', value: '*/*' }],
    });
    const names = headers!.map(({ name }) => name.toLowerCase());
    expect(names).toEqual(
      expect.arrayContaining(['sec-gpc', 'dnt', 'sec-ch-ua', 'accept']),
    );
  });

  it('lose cookies on another site’s requests from a page', () => {
    const helper = rules();
    helper.responseStarted(page('https://news.example/'));
    const headers = helper.beforeSendHeaders({
      url: 'https://tracker.example/pixel',
      type: 'image',
      tabId: 1,
      requestHeaders: [{ name: 'Cookie', value: 'id=1' }],
    });
    expect(headers!.some(({ name }) => name === 'Cookie')).toBe(false);
    const own = helper.beforeSendHeaders({
      url: 'https://static.news.example/a.js',
      type: 'script',
      tabId: 1,
      requestHeaders: [{ name: 'Cookie', value: 'id=1' }],
    });
    expect(own!.some(({ name }) => name === 'Cookie')).toBe(true);
  });
});

describe('response headers', () => {
  it('add a policy that keeps scripts and images off a site the user blocked them on', () => {
    const headers = rules().headersReceived({
      ...page('https://scripts-off.example/'),
      responseHeaders: [
        { name: 'Content-Security-Policy', value: "default-src 'self'" },
      ],
    });
    expect(headers).toEqual([
      { name: 'Content-Security-Policy', value: "default-src 'self'" },
      {
        name: 'Content-Security-Policy',
        value: "script-src 'none'; img-src 'none'",
      },
    ]);
  });

  it('drop another site’s cookies', () => {
    const helper = rules();
    helper.responseStarted(page('https://news.example/'));
    expect(
      helper.headersReceived({
        url: 'https://tracker.example/pixel',
        type: 'image',
        tabId: 1,
        responseHeaders: [
          { name: 'Set-Cookie', value: 'id=1' },
          { name: 'Content-Type', value: 'image/gif' },
        ],
      }),
    ).toEqual([{ name: 'Content-Type', value: 'image/gif' }]);
  });

  it('stay as they are when nothing applies', () => {
    expect(
      rules().headersReceived({
        ...page('https://news.example/'),
        responseHeaders: [{ name: 'Set-Cookie', value: 'id=1' }],
      }),
    ).toBeUndefined();
  });
});
