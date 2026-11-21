import {
  acceptLanguages,
  brandsOf,
  identityOf,
  requestedHints,
  withClientHints,
} from './client-hints';

const identity = identityOf({
  chromeVersion: '156.0.8078.80',
  platform: 'darwin',
  systemVersion: '27.0.1',
  arch: 'arm64',
});

describe('brandsOf', () => {
  // What navigator.userAgentData reported in Splash on Electron 45.2.3.
  it('matches what pages read on Chromium 156', () => {
    expect(brandsOf('156.0.8078.80', false)).toEqual([
      { brand: 'Not:A-Brand', version: '8' },
      { brand: 'Chromium', version: '156' },
    ]);
    expect(brandsOf('156.0.8078.80', true)).toEqual([
      { brand: 'Not:A-Brand', version: '8.0.0.0' },
      { brand: 'Chromium', version: '156.0.8078.80' },
    ]);
  });

  it('swaps the order on odd major versions, as Chromium does', () => {
    expect(brandsOf('157.0.1.2', false)).toEqual([
      { brand: 'Chromium', version: '157' },
      { brand: 'Not-A.Brand', version: '99' },
    ]);
  });
});

describe('withClientHints', () => {
  it('adds the three hints Chrome always sends to secure addresses', () => {
    expect(
      withClientHints({}, 'https://accounts.google.com/', identity),
    ).toEqual({
      'sec-ch-ua': '"Not:A-Brand";v="8", "Chromium";v="156"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    });
  });

  it('sends none over plain HTTP', () => {
    const headers = { Accept: '*/*' };
    expect(withClientHints(headers, 'http://example.com/', identity)).toBe(
      headers,
    );
  });

  it('adds the hints a site asked for', () => {
    const asked = requestedHints([
      'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Platform-Version',
      'sec-ch-ua-arch,Viewport-Width',
    ]);
    expect(
      withClientHints({}, 'https://www.paypal.com/', identity, asked),
    ).toMatchObject({
      'sec-ch-ua-full-version-list':
        '"Not:A-Brand";v="8.0.0.0", "Chromium";v="156.0.8078.80"',
      'sec-ch-ua-platform-version': '"27.0.1"',
      'sec-ch-ua-arch': '"arm"',
    });
    expect(asked.has('viewport-width')).toBe(false);
  });

  it('keeps a hint that is already there', () => {
    const headers = withClientHints(
      { 'Sec-CH-UA': 'x' },
      'https://example.com/',
      identity,
    );
    expect(headers['Sec-CH-UA']).toBe('x');
    expect(headers['sec-ch-ua']).toBeUndefined();
  });
});

describe('acceptLanguages', () => {
  it('follows each regional language with its base, as Chrome does', () => {
    expect(acceptLanguages(['en-US', 'de-DE'])).toBe('en-US,en,de-DE,de');
  });

  it('adds the base once, after the last variant', () => {
    expect(acceptLanguages(['en-US', 'en-GB', 'fr'])).toBe('en-US,en-GB,en,fr');
    expect(acceptLanguages(['de', 'de-AT'])).toBe('de,de-AT');
  });
});
