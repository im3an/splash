import { describe, expect, it } from 'vitest';
import { trailSummaries } from './trail-summary';

const page = (
  lastActiveAt: number,
  childIds: string[] = [],
  url: string | null = 'https://example.com/',
) => ({ childIds, url, customTitle: null, lastActiveAt });

describe('trailSummaries', () => {
  it('finds where each trail was left, the one on screen first', () => {
    const summaries = trailSummaries({
      rootIds: ['a', 'b', 'c'],
      activePageId: 'c',
      pages: {
        a: page(10, ['a1']),
        a1: page(50, ['a2']),
        a2: page(20),
        b: page(90),
        c: page(5),
      },
    });
    expect(summaries).toEqual([
      {
        rootId: 'c',
        leftId: 'c',
        pageCount: 1,
        lastActiveAt: 5,
        current: true,
      },
      {
        rootId: 'b',
        leftId: 'b',
        pageCount: 1,
        lastActiveAt: 90,
        current: false,
      },
      {
        rootId: 'a',
        leftId: 'a1',
        pageCount: 3,
        lastActiveAt: 50,
        current: false,
      },
    ]);
  });

  it('counts the current page anywhere in a trail', () => {
    const [summary] = trailSummaries({
      rootIds: ['a'],
      activePageId: 'a1',
      pages: { a: page(1, ['a1']), a1: page(0) },
    });
    expect(summary).toMatchObject({ current: true, leftId: 'a' });
  });

  it('leaves out a lone empty page, but not a named one', () => {
    const summaries = trailSummaries({
      rootIds: ['empty', 'named', 'parent'],
      activePageId: null,
      pages: {
        empty: page(1, [], null),
        named: { ...page(1, [], null), customTitle: 'Plans' },
        parent: page(1, ['child'], null),
        child: page(1),
      },
    });
    expect(summaries.map((summary) => summary.rootId)).toEqual([
      'named',
      'parent',
    ]);
  });
});
