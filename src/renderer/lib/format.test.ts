import { page } from '../test-fixtures';
import { describeError, displayUrl, pageLabel, securityOf } from './format';

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
  it('prefers the title, then the host, then a placeholder', () => {
    expect(pageLabel(page('a', { title: 'Docs' }))).toBe('Docs');
    expect(pageLabel(page('a', { title: '  ', url: 'https://x.dev/p' }))).toBe(
      'x.dev',
    );
    expect(pageLabel(page('a', { title: '', url: null }))).toBe('New page');
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
    expect(detail).toMatch(/address couldn’t be found/);
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
