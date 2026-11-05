import { describe, expect, it, vi } from 'vitest';
import {
  fallsBackToHttp,
  httpsUpgradeFor,
  secureUpgradeOf,
  SecureAttempt,
  typedPlainAddress,
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
