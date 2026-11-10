import { describe, expect, it } from 'vitest';
import { splitBlocks } from './blocks';

const texts = (body: string) =>
  splitBlocks(body).map((block) => [
    block.kind,
    block.line,
    body.slice(block.start, block.end),
  ]);

describe('splitBlocks', () => {
  it('splits on blank lines and puts headings on their own', () => {
    expect(texts('# Title\nIntro line\nmore\n\n\n## Two\n- a\n- b')).toEqual([
      ['h1', 0, '# Title'],
      ['text', 1, 'Intro line\nmore'],
      ['h2', 5, '## Two'],
      ['text', 6, '- a\n- b'],
    ]);
  });

  it('keeps fences and display math whole across blank lines', () => {
    const body =
      'a\n```mermaid\ngraph LR\n\n  A-->B\n```\n$$\nx\n\ny\n$$\n$$z$$\nb';
    expect(texts(body)).toEqual([
      ['text', 0, 'a'],
      ['code', 1, '```mermaid\ngraph LR\n\n  A-->B\n```'],
      ['math', 6, '$$\nx\n\ny\n$$'],
      ['math', 11, '$$z$$'],
      ['text', 12, 'b'],
    ]);
  });

  it('offsets blocks of a slice into the whole note', () => {
    const [block] = splitBlocks('\n\nhi', 10, 4);
    expect(block).toMatchObject({ start: 12, end: 14, line: 6 });
  });

  it('runs an unclosed fence to the end', () => {
    expect(texts('```\ncode\n\nmore')).toEqual([
      ['code', 0, '```\ncode\n\nmore'],
    ]);
  });
});
