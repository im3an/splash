import { describe, expect, it, vi } from 'vitest';
import {
  fallsBackToHttp,
  httpsUpgradeFor,
  popupFallback,
  popupUpgraded,
  POPUP_MEMORY,
  secureUpgradeOf,
  SecureAttempt,
  typedPlainAddress,
  wantsSecurePopup,
  wwwSibling,
} from './https-only';

describe('secureUpgradeOf', () => {
  it('moves a public site to HTTPS, keeping everything else', () => {
    expect(secureUpgradeOf('http://example.com/a?b=1#c')).toBe(
      'https://example.com/a?b=1#c',
    );
    expect(secureUpgradeOf('http://example.com:8080/')).toBe(
      'https://example.com:8080/',
    );
  });

  it.each([
    'http://localhost:3000/',
    'http://app.localhost/',
    'http://127.0.0.1:8080/',
    'http://192.168.1.20/',
    'http://8.8.8.8/',
    'http://[::1]:3000/',
    'http://router/',
    'http://printer.local/',
    'http://nas.lan/',
    'http://box.internal/',
    'http://mybox.home.arpa/',
    'http://site.test/',
  ])('leaves %s alone: it has no public certificate', (url) => {
    expect(secureUpgradeOf(url)).toBeNull();
  });

  it.each([
    'https://example.com/',
    'file:///etc/passwd',
    'chrome-extension://abc/page.html',
    'not a url',
  ])('ignores %s', (url) => {
    expect(secureUpgradeOf(url)).toBeNull();
  });

  it('is not fooled by a lookalike of a local name', () => {
    expect(secureUpgradeOf('http://localhost.evil.com/')).toBe(
      'https://localhost.evil.com/',
    );
    expect(secureUpgradeOf('http://local.example.com/')).toBe(
      'https://local.example.com/',
    );
  });
});

describe('httpsUpgradeFor', () => {
  const allow = (result: boolean | null) => vi.fn(() => result);

  it('upgrades when the setting is on and the site has no exception', () => {
    const decided = allow(null);
    expect(httpsUpgradeFor('http://example.com/a', true, decided)).toBe(
      'https://example.com/a',
    );
    expect(decided).toHaveBeenCalledWith('http://example.com');
  });

  it('does nothing when the setting is off', () => {
    expect(httpsUpgradeFor('http://example.com/', false, allow(null))).toBe(
      null,
    );
  });

  it('respects a site the user chose to continue on', () => {
    expect(httpsUpgradeFor('http://example.com/', true, allow(true))).toBe(
      null,
    );
  });

  it('upgrades again once the user takes the exception back', () => {
    expect(httpsUpgradeFor('http://example.com/', true, allow(false))).toBe(
      'https://example.com/',
    );
  });
});

describe('typedPlainAddress', () => {
  it('gives the plain form of a host typed without a scheme', () => {
    expect(typedPlainAddress('neverssl.com', 'https://neverssl.com/')).toBe(
      'http://neverssl.com/',
    );
    expect(
      typedPlainAddress('  neverssl.com/a  ', 'https://neverssl.com/a'),
    ).toBe('http://neverssl.com/a');
  });

  it('says nothing when the user asked for HTTPS themselves', () => {
    expect(
      typedPlainAddress('https://bank.example/', 'https://bank.example/'),
    ).toBeNull();
  });

  it('says nothing for a search or a keyword', () => {
    const search = 'https://www.google.com/search?q=cats';
    expect(typedPlainAddress('cats', search)).toBeNull();
    expect(typedPlainAddress('g cats', search)).toBeNull();
    expect(typedPlainAddress('yt', 'https://www.youtube.com/')).toBeNull();
  });
});

describe('fallsBackToHttp', () => {
  it.each([
    [-100, 'connection closed'],
    [-101, 'connection reset'],
    [-102, 'connection refused'],
    [-107, 'SSL protocol error'],
    [-113, 'no shared cipher'],
    [-118, 'connection timed out'],
    [-200, 'certificate name mismatch'],
    [-202, 'certificate authority invalid'],
    [-310, 'too many redirects: the site sends HTTPS back to HTTP'],
    [-324, 'empty response'],
  ])('offers HTTP after %i (%s)', (code) => {
    expect(fallsBackToHttp(code)).toBe(true);
  });

  it.each([
    [-3, 'aborted'],
    [-20, 'blocked by the ad blocker'],
    [-105, 'no such host: HTTP would fail too'],
    [-106, 'offline: the page retries by itself'],
    [-109, 'address unreachable'],
    [-137, 'DNS failed'],
  ])('keeps the ordinary page after %i (%s)', (code) => {
    expect(fallsBackToHttp(code)).toBe(false);
  });
});

describe('SecureAttempt', () => {
  const plain = 'http://example.com/';
  const secure = 'https://example.com/';

  it('offers the plain address when the upgraded load fails', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    attempt.navigationStarted(secure);
    expect(attempt.failed(-102)).toBe(plain);
  });

  it('offers nothing when no upgrade was tried', () => {
    expect(new SecureAttempt().failed(-102)).toBeNull();
  });

  it('offers nothing for a failure HTTP would not help', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    expect(attempt.failed(-105)).toBeNull();
  });

  it('survives the navigation it belongs to, whichever came first', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    attempt.navigationStarted(plain);
    attempt.navigationStarted(secure);
    expect(attempt.failed(-102)).toBe(plain);
  });

  it('ends when the page goes somewhere else', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    attempt.navigationStarted('https://other.example/');
    expect(attempt.failed(-102)).toBeNull();
  });

  it('ends once the page has loaded: a later HTTPS failure stays HTTPS', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    attempt.committed();
    expect(attempt.failed(-102)).toBeNull();
  });

  it('is used up by its failure', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    expect(attempt.failed(-102)).toBe(plain);
    expect(attempt.failed(-102)).toBeNull();
  });

  it('follows a redirect that gets upgraded along the way', () => {
    const attempt = new SecureAttempt();
    attempt.begin(plain, secure);
    attempt.begin('http://www.example.com/', 'https://www.example.com/');
    expect(attempt.failed(-102)).toBe('http://www.example.com/');
  });
});

describe('a site that moves between its two names', () => {
  it('finds the other name, either way round, keeping the port', () => {
    expect(wwwSibling('http://example.com')).toBe('http://www.example.com');
    expect(wwwSibling('http://www.example.com')).toBe('http://example.com');
    expect(wwwSibling('http://example.com:8080')).toBe(
      'http://www.example.com:8080',
    );
  });

  it('asks once: agreeing to one name covers the other', () => {
    const agreedTo = (origin: string) => origin === 'http://example.com';
    expect(httpsUpgradeFor('http://www.example.com/', true, agreedTo)).toBe(
      null,
    );
  });

  it('keeps asking for a different site', () => {
    const agreedTo = (origin: string) => origin === 'http://example.com';
    expect(httpsUpgradeFor('http://other.example.com/', true, agreedTo)).toBe(
      'https://other.example.com/',
    );
  });
});

describe('popups', () => {
  const plain = 'http://popup-only.test/a';
  const secure = 'https://popup-only.test/a';

  it('ignores a failure that was not its own try at HTTPS', () => {
    expect(popupFallback('https://never-tried.test/', -107)).toBe(null);
  });

  it('goes back to the address asked for, and not over HTTPS again', () => {
    expect(wantsSecurePopup(plain)).toBe(true);
    popupUpgraded(plain, secure);
    // A name that doesn't exist won't exist over HTTP either.
    expect(popupFallback(secure, -105)).toBe(null);
    // The site doesn't speak HTTPS.
    expect(popupFallback(secure, -107)).toBe(plain);
    expect(wantsSecurePopup(plain)).toBe(false);
    expect(popupFallback(secure, -107)).toBe(null);
  });

  it('forgets the oldest tries instead of keeping every popup until quit', () => {
    const first = 'https://first-of-many.test/';
    popupUpgraded('http://first-of-many.test/', first);
    for (let i = 0; i < POPUP_MEMORY; i++) {
      popupUpgraded(`http://many-${i}.test/`, `https://many-${i}.test/`);
    }
    expect(popupFallback(first, -107)).toBe(null);
    const last = POPUP_MEMORY - 1;
    expect(popupFallback(`https://many-${last}.test/`, -107)).toBe(
      `http://many-${last}.test/`,
    );
  });
});

describe('a secure address that answers with an error', () => {
  it('offers HTTP once, and only for an error', () => {
    const attempt = new SecureAttempt();
    attempt.begin('http://a.test/', 'https://a.test/');
    expect(attempt.answeredWithError(200)).toBe(null);
    expect(attempt.active).toBe(true);
    expect(attempt.answeredWithError(404)).toBe('http://a.test/');
    expect(attempt.active).toBe(false);
    expect(attempt.answeredWithError(500)).toBe(null);
  });
});
