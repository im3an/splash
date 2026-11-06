import { describe, expect, it } from 'vitest';
import { pagesBelow, type TrailShape } from './pages-below';

/*
 * pin
 * root
 *   a
 *     a1
 *   b
 * other
 */
function trail(pinned: readonly string[] = ['pin']): TrailShape {
  const page = (id: string, childIds: string[], parentId: string | null) => ({
    childIds,
    parentId,
    isPinned: pinned.includes(id),
  });
  return {
    rootIds: ['pin', 'root', 'other'],
    pages: {
      pin: page('pin', [], null),
      root: page('root', ['a', 'b'], null),
      a: page('a', ['a1'], 'root'),
      a1: page('a1', [], 'a'),
      b: page('b', [], 'root'),
      other: page('other', [], null),
    },
  };
}

describe('pagesBelow', () => {
  it('is every page after this one in sidebar order, its children too', () => {
    expect(pagesBelow(trail(), 'a')).toEqual(['a1', 'b', 'other']);
    expect(pagesBelow(trail(), 'root')).toEqual(['a', 'a1', 'b', 'other']);
  });

  it('is nothing for the last page, or a page that is not there', () => {
    expect(pagesBelow(trail(), 'other')).toEqual([]);
    expect(pagesBelow(trail(), 'gone')).toEqual([]);
  });

  it('is nothing for a pinned page, whose stack sits above the trail', () => {
    expect(pagesBelow(trail(), 'pin')).toEqual([]);
  });

  it('keeps a pinned page and the pages above it', () => {
    expect(pagesBelow(trail(['pin', 'a1']), 'root')).toEqual(['b', 'other']);
  });
});
