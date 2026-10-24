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

  it('reveals a node by expanding its ancestors', () => {
    const tree = build();
    tree.setCollapsed('a', true);
    tree.setCollapsed('b', true);
    tree.reveal('d');
    expect(tree.get('a')?.collapsed).toBe(false);
    expect(tree.get('b')?.collapsed).toBe(false);
  });

  it('removes a whole subtree', () => {
    const tree = build();
    expect(tree.removeSubtree('a')).toEqual(['a', 'b', 'd', 'c']);
    expect(tree.rootIds).toEqual(['e']);
    expect(tree.size).toBe(1);
  });

  it('skips children when choosing a successor for a removed subtree', () => {
    expect(build().successorOf('b', true)).toBe('c');
    expect(build().successorOf('a', true)).toBe('e');
    expect(build().successorOf('d', true)).toBe('b');
  });

  it('moves a node with its subtree before a sibling', () => {
    const tree = build();
    tree.move('c', 'a', 'b');
    expect(tree.get('a')?.childIds).toEqual(['c', 'b']);
    tree.move('e', null, 'a');
    expect(tree.rootIds).toEqual(['e', 'a']);
  });

  it('moves a node to the end of another parent', () => {
    const tree = build();
    tree.move('b', 'e', null);
    expect(tree.get('e')?.childIds).toEqual(['b']);
    expect(tree.get('b')?.parentId).toBe('e');
    expect(tree.order()).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('reorders within the same parent', () => {
    const tree = build();
    tree.move('b', 'a', null);
    expect(tree.get('a')?.childIds).toEqual(['c', 'b']);
  });

  it('refuses to move a node into its own subtree', () => {
    const tree = build();
    expect(() => tree.move('a', 'd', null)).toThrow();
    expect(() => tree.move('a', 'a', null)).toThrow();
    expect(() => tree.move('c', 'a', 'd')).toThrow();
    expect(tree.order()).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('knows descendants', () => {
    const tree = build();
    expect(tree.isDescendant('d', 'a')).toBe(true);
    expect(tree.isDescendant('a', 'd')).toBe(false);
    expect(tree.descendantsOf('a')).toEqual(['b', 'd', 'c']);
  });
});
