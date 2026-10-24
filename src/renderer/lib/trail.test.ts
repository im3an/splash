import { sampleSnapshot } from '../test-fixtures';
import { visibleRows } from './trail';

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
