import { isNavigableUrl, resolveAddressInput, searchUrl } from './url';

describe('resolveAddressInput', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['example.com/path?q=1', 'https://example.com/path?q=1'],
    ['sub.example.co.uk', 'https://sub.example.co.uk/'],
    ['https://example.com/a', 'https://example.com/a'],
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
