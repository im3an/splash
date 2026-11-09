import { TrailTree } from './trail-tree';

function build() {
  // a
  // ├─ b
  // │  └─ d
  // └─ c
  // e
  const tree = new TrailTree();
  tree.add('a');
  tree.add('b', 'a');
  tree.add('c', 'a');
  tree.add('d', 'b');
  tree.add('e');
  return tree;
}

describe('TrailTree', () => {
  it('orders nodes depth-first', () => {
    expect(build().order()).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('rejects unknown parents and duplicate ids', () => {
    const tree = build();
    expect(() => tree.add('x', 'missing')).toThrow();
    expect(() => tree.add('a')).toThrow();
  });

  it('promotes children into the removed node’s place', () => {
    const tree = build();
    tree.remove('b');
    expect(tree.get('a')?.childIds).toEqual(['d', 'c']);
    expect(tree.get('d')?.parentId).toBe('a');
    expect(tree.order()).toEqual(['a', 'd', 'c', 'e']);
  });

  it('promotes root children to roots', () => {
    const tree = build();
    tree.remove('a');
    expect(tree.rootIds).toEqual(['b', 'c', 'e']);
    expect(tree.get('b')?.parentId).toBeNull();
  });

  it.each([
    ['b', 'd'], // first child inherits the place
    ['d', 'b'], // only child falls back to its parent
    ['c', 'b'], // last child falls back to the previous sibling
    ['a', 'b'],
    ['e', 'a'],
  ])('chooses a successor for %s', (id, expected) => {
    expect(build().successorOf(id)).toBe(expected);
  });

  it('has no successor for the last page', () => {
    const tree = new TrailTree();
    tree.add('only');
    expect(tree.successorOf('only')).toBeNull();
  });

  it('inserts at a given position', () => {
    const tree = build();
    tree.add('x', 'a', 1);
    tree.add('y', null, 0);
    expect(tree.get('a')?.childIds).toEqual(['b', 'x', 'c']);
    expect(tree.rootIds).toEqual(['y', 'a', 'e']);
    expect(tree.indexOf('x')).toBe(1);
  });

  it('moves a branch to a new parent and position', () => {
    const tree = build();
    tree.move('b', 'e', 0);
    expect(tree.get('a')?.childIds).toEqual(['c']);
    expect(tree.get('e')?.childIds).toEqual(['b']);
    expect(tree.get('b')?.parentId).toBe('e');
    expect(tree.order()).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('reorders among siblings using post-removal indices', () => {
    const tree = build();
    tree.move('b', 'a', 1);
    expect(tree.get('a')?.childIds).toEqual(['c', 'b']);
    tree.move('e', null, 0);
    expect(tree.rootIds).toEqual(['e', 'a']);
  });

  it('refuses to move a node into its own branch', () => {
    const tree = build();
    expect(() => tree.move('a', 'd', 0)).toThrow();
    expect(() => tree.move('b', 'b', 0)).toThrow();
    expect(tree.order()).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('removes a whole branch', () => {
    const tree = build();
    expect(tree.removeBranch('b')).toEqual(['b', 'd']);
    expect(tree.has('d')).toBe(false);
    expect(tree.order()).toEqual(['a', 'c', 'e']);
  });

  it('chooses a successor for a removed branch', () => {
    const tree = build();
    expect(tree.branchSuccessorOf('b')).toBe('c');
    expect(tree.branchSuccessorOf('c')).toBe('b');
    expect(tree.branchSuccessorOf('d')).toBe('b');
  });
});
