import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK,
  readFrontMatter,
  writeFrontMatter,
} from './front-matter';

describe('front matter', () => {
  it('reads the look and keeps keys it does not know', () => {
    const { look, extra, markdown } = readFrontMatter(
      '---\nfont: serif\nwide: true\nicon: 🌱\ntags: [a]\n---\n\n# Hi',
    );
    expect(look).toEqual({
      font: 'serif',
      small: false,
      wide: true,
      icon: '🌱',
      pinned: false,
    });
    expect(extra).toEqual(['tags: [a]']);
    expect(markdown).toBe('# Hi');
  });

  it('leaves plain notes alone both ways', () => {
    expect(readFrontMatter('# Hi').markdown).toBe('# Hi');
    expect(writeFrontMatter(DEFAULT_LOOK, '# Hi')).toBe('# Hi');
  });

  it('round-trips', () => {
    const body = writeFrontMatter(
      { font: 'mono', small: true, wide: false, icon: '✏️', pinned: true },
      '# Hi',
      ['tags: x'],
    );
    const read = readFrontMatter(body);
    expect(writeFrontMatter(read.look, read.markdown, read.extra)).toBe(body);
  });
});
