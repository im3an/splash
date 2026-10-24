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
});
