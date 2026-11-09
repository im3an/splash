import { describe, expect, it } from 'vitest';
import { formatPageLink, markdownLink, plainTextLink } from './page-link';

describe('markdownLink', () => {
  it('links the title to the address', () => {
    expect(markdownLink('Trail maps', 'https://example.com/a')).toBe(
      '[Trail maps](https://example.com/a)',
    );
  });

  it('escapes brackets and backslashes in the title', () => {
    expect(markdownLink('a [b] \\c', 'https://example.com/')).toBe(
      '[a \\[b\\] \\\\c](https://example.com/)',
    );
  });

  it('keeps parentheses in the address from ending the link', () => {
    expect(markdownLink('Trail', 'https://en.wikipedia.org/wiki/A_(b)')).toBe(
      '[Trail](https://en.wikipedia.org/wiki/A_%28b%29)',
    );
  });

  it('keeps a multi-line title on one line', () => {
    expect(markdownLink(' a\n  b ', 'https://example.com/')).toBe(
      '[a b](https://example.com/)',
    );
  });

  it('falls back to the site for an untitled page', () => {
    expect(markdownLink('', 'https://www.example.com/a')).toBe(
      '[example.com](https://www.example.com/a)',
    );
  });
});

describe('plainTextLink', () => {
  it('puts the title above the address', () => {
    expect(plainTextLink('Trail maps', 'https://example.com/')).toBe(
      'Trail maps\nhttps://example.com/',
    );
  });

  it('gives just the address for an untitled page', () => {
    expect(plainTextLink('  ', 'https://example.com/')).toBe(
      'https://example.com/',
    );
  });
});

it('picks the format', () => {
  expect(formatPageLink('markdown', 'T', 'https://e.com/')).toBe(
    '[T](https://e.com/)',
  );
  expect(formatPageLink('text', 'T', 'https://e.com/')).toBe(
    'T\nhttps://e.com/',
  );
});
