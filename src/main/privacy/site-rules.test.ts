import { describe, expect, it } from 'vitest';
import {
  contentPolicyFor,
  isThirdParty,
  withoutCookie,
  withoutSetCookie,
  withPrivacySignal,
} from './site-rules';

describe('withPrivacySignal', () => {
  it('adds both signals and keeps what was there', () => {
    expect(withPrivacySignal({ Accept: '*/*' })).toEqual({
      Accept: '*/*',
      'Sec-GPC': '1',
      DNT: '1',
    });
  });
});

describe('isThirdParty', () => {
  it.each([
    ['https://cdn.example.com/a.js', 'https://www.example.com/'],
    ['http://example.com/', 'https://example.com/'],
    ['https://example.co.uk/', 'https://shop.example.co.uk/page'],
  ])('%s is first party on %s', (url, top) => {
    expect(isThirdParty(url, top)).toBe(false);
  });

  it.each([
    ['https://tracker.net/p.gif', 'https://example.com/'],
    ['https://other.co.uk/', 'https://example.co.uk/'],
    ['https://alice.github.io/', 'https://bob.github.io/'],
    ['http://localhost:1/', 'http://127.0.0.1:1/'],
  ])('%s is third party on %s', (url, top) => {
    expect(isThirdParty(url, top)).toBe(true);
  });

  it('judges only web pages', () => {
    expect(isThirdParty('https://a.com/', 'chrome-extension://abc/x')).toBe(
      false,
    );
    expect(isThirdParty('https://a.com/', 'about:blank')).toBe(false);
    expect(isThirdParty('https://a.com/', 'not a url')).toBe(false);
  });
});

describe('cookie headers', () => {
  it('drops them whatever their case, and nothing else', () => {
    expect(
      withoutCookie({ cookie: 'a=1', COOKIE: 'b=2', Accept: 'x' }),
    ).toEqual({ Accept: 'x' });
    expect(
      withoutSetCookie({
        'Set-Cookie': ['a=1'],
        'set-cookie': ['b'],
        Etag: ['x'],
      }),
    ).toEqual({ Etag: ['x'] });
  });
});

describe('contentPolicyFor', () => {
  it('names what is blocked, or nothing', () => {
    expect(contentPolicyFor({ scripts: false, images: false })).toBeNull();
    expect(contentPolicyFor({ scripts: true, images: false })).toBe(
      "script-src 'none'",
    );
    expect(contentPolicyFor({ scripts: true, images: true })).toBe(
      "script-src 'none'; img-src 'none'",
    );
  });
});
