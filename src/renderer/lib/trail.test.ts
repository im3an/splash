import { sampleSnapshot } from '../test-fixtures';
import { dropTarget, isDescendant, moveTarget, visibleRows } from './trail';

// a → (b → d), c; e

describe('visibleRows', () => {
  it('lists pages depth-first with their depth', () => {
    expect(visibleRows(sampleSnapshot())).toEqual([
      { id: 'a', depth: 0, hasChildren: true },
      { id: 'b', depth: 1, hasChildren: true },
      { id: 'd', depth: 2, hasChildren: false },
      { id: 'c', depth: 1, hasChildren: false },
      { id: 'e', depth: 0, hasChildren: false },
    ]);
  });

  it('skips the descendants of collapsed pages', () => {
    const rows = visibleRows(sampleSnapshot({ b: { collapsed: true } }));
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'e']);
  });
});

describe('moveTarget', () => {
  const snapshot = sampleSnapshot();

  it.each([
    ['c', 'up', { parentId: 'a', beforeId: 'b' }],
    ['b', 'up', null],
    ['b', 'down', { parentId: 'a', beforeId: null }],
    ['a', 'down', { parentId: null, beforeId: null }],
    ['c', 'down', null],
    ['c', 'indent', { parentId: 'b', beforeId: null }],
    ['b', 'indent', null],
    ['e', 'indent', { parentId: 'a', beforeId: null }],
    ['d', 'outdent', { parentId: 'a', beforeId: 'c' }],
    ['c', 'outdent', { parentId: null, beforeId: 'e' }],
    ['a', 'outdent', null],
  ] as const)('moves %s %s', (id, direction, expected) => {
    expect(moveTarget(snapshot, id, direction)).toEqual(expected);
  });
});

describe('isDescendant', () => {
  it('walks up the parents', () => {
    expect(isDescendant(sampleSnapshot(), 'd', 'a')).toBe(true);
    expect(isDescendant(sampleSnapshot(), 'a', 'd')).toBe(false);
  });
});

describe('dropTarget', () => {
  const snapshot = sampleSnapshot();

  it('places a page before or after a row', () => {
    expect(dropTarget(snapshot, 'e', 'b', 'before')).toEqual({
      parentId: 'a',
      beforeId: 'b',
    });
    expect(dropTarget(snapshot, 'e', 'c', 'after')).toEqual({
      parentId: 'a',
      beforeId: null,
    });
  });

  it('nests a page inside a row', () => {
    expect(dropTarget(snapshot, 'e', 'c', 'inside')).toEqual({
      parentId: 'c',
      beforeId: null,
    });
  });

  it('treats "after an expanded page" as its first child', () => {
    expect(dropTarget(snapshot, 'e', 'b', 'after')).toEqual({
      parentId: 'b',
      beforeId: 'd',
    });
  });

  it('moves to the end of the trail when dropped below the rows', () => {
    expect(dropTarget(snapshot, 'b', null, 'after')).toEqual({
      parentId: null,
      beforeId: null,
    });
    expect(dropTarget(snapshot, 'e', null, 'after')).toBeNull();
  });

  it('refuses drops into the page itself or its subtree', () => {
    expect(dropTarget(snapshot, 'a', 'a', 'inside')).toBeNull();
    expect(dropTarget(snapshot, 'a', 'd', 'before')).toBeNull();
  });

  it('ignores drops that leave the page where it is', () => {
    expect(dropTarget(snapshot, 'c', 'b', 'after')).toEqual({
      parentId: 'b',
      beforeId: 'd',
    });
    expect(dropTarget(snapshot, 'c', 'e', 'before')).toEqual({
      parentId: null,
      beforeId: 'e',
    });
    expect(dropTarget(snapshot, 'b', 'c', 'before')).toBeNull();
    expect(dropTarget(snapshot, 'd', 'b', 'inside')).toBeNull();
  });
});
