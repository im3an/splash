import { sampleSnapshot } from '../test-fixtures';
import { projectDrop, rowsWhileDragging } from './drop-projection';
import { visibleRows } from './trail';

// a
// ├─ b
// │  └─ d
// └─ c
// e
const rows = visibleRows(sampleSnapshot());
const INDENT = 14;

describe('rowsWhileDragging', () => {
  it('hides the dragged page’s descendants', () => {
    expect(rowsWhileDragging(rows, 'b').map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
      'e',
    ]);
  });
});

describe('projectDrop', () => {
  it('keeps a page in place without horizontal movement', () => {
    expect(projectDrop(rows, 'c', 'c', 0, INDENT)).toEqual({
      depth: 1,
      parentId: 'a',
      afterId: 'b',
    });
  });

  it('reorders among siblings', () => {
    expect(projectDrop(rows, 'c', 'b', 0, INDENT)).toEqual({
      depth: 1,
      parentId: 'a',
      afterId: null,
    });
  });

  it('nests under the row above when dragged right', () => {
    expect(projectDrop(rows, 'e', 'e', INDENT, INDENT)).toEqual({
      depth: 1,
      parentId: 'a',
      afterId: 'c',
    });
    expect(projectDrop(rows, 'c', 'c', INDENT, INDENT)).toEqual({
      depth: 2,
      parentId: 'b',
      afterId: 'd',
    });
    expect(projectDrop(rows, 'c', 'c', INDENT * 2, INDENT)).toEqual({
      depth: 3,
      parentId: 'd',
      afterId: null,
    });
  });

  it('outdents when dragged left, within what the next row allows', () => {
    expect(projectDrop(rows, 'c', 'c', -INDENT, INDENT)).toEqual({
      depth: 0,
      parentId: null,
      afterId: 'a',
    });
    // d sits above c, which is still a child of a, so d can only go to depth 1.
    expect(projectDrop(rows, 'd', 'd', -INDENT * 3, INDENT)).toEqual({
      depth: 1,
      parentId: 'a',
      afterId: 'b',
    });
  });

  it('moves a branch to the top of the trail', () => {
    expect(projectDrop(rows, 'e', 'a', 0, INDENT)).toEqual({
      depth: 0,
      parentId: null,
      afterId: null,
    });
  });

  it('cannot be dropped deeper than one level below the row above', () => {
    expect(projectDrop(rows, 'e', 'e', INDENT * 5, INDENT)?.depth).toBe(2);
  });

  it('returns null for unknown rows', () => {
    expect(projectDrop(rows, 'x', 'a', 0, INDENT)).toBeNull();
  });
});
