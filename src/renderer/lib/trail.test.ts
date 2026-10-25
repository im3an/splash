import { sampleSnapshot } from '../test-fixtures';
import { hiddenSummary, visibleRows } from './trail';

describe('visibleRows', () => {
  it('lists pages depth-first with their depth', () => {
    expect(visibleRows(sampleSnapshot())).toEqual([
      { id: 'a', parentId: null, depth: 0, hasChildren: true },
      { id: 'b', parentId: 'a', depth: 1, hasChildren: true },
      { id: 'd', parentId: 'b', depth: 2, hasChildren: false },
      { id: 'c', parentId: 'a', depth: 1, hasChildren: false },
      { id: 'e', parentId: null, depth: 0, hasChildren: false },
    ]);
  });

  it('skips the descendants of collapsed pages', () => {
    const rows = visibleRows(sampleSnapshot({ b: { collapsed: true } }));
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'e']);
  });
});

describe('hiddenSummary', () => {
  it('is null for expanded pages and pages without children', () => {
    expect(hiddenSummary(sampleSnapshot(), 'a')).toBeNull();
    expect(
      hiddenSummary(sampleSnapshot({ c: { collapsed: true } }), 'c'),
    ).toBeNull();
  });

  it('collects what the collapsed pages are doing', () => {
    const snapshot = sampleSnapshot({
      a: { collapsed: true },
      b: { isAudible: true, isMuted: true },
      c: { isAudible: true },
      d: { isUnresponsive: true },
    });
    expect(hiddenSummary(snapshot, 'a')).toEqual({
      ids: ['b', 'd', 'c'],
      playing: ['c'],
      failedId: 'd',
    });
  });
});
