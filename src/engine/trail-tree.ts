import type { PageId } from '../shared/types';

export interface TrailNode {
  id: PageId;
  parentId: PageId | null;
  childIds: PageId[];
  collapsed: boolean;
}

/**
 * The structure of a trail: which page came from which, in what order.
 * Pure data with no Electron dependency — page content lives elsewhere.
 */
export class TrailTree {
  private readonly nodes = new Map<PageId, TrailNode>();
  private readonly roots: PageId[] = [];

  get rootIds(): readonly PageId[] {
    return this.roots;
  }

  get size(): number {
    return this.nodes.size;
  }

  has(id: PageId): boolean {
    return this.nodes.has(id);
  }

  get(id: PageId): Readonly<TrailNode> | undefined {
    return this.nodes.get(id);
  }

  /** Adds a node as the last child of `parentId`, or as the last root. */
  add(id: PageId, parentId: PageId | null = null): Readonly<TrailNode> {
    if (this.nodes.has(id)) throw new Error(`Node ${id} already exists`);
    if (parentId !== null && !this.nodes.has(parentId)) {
      throw new Error(`Parent ${parentId} does not exist`);
    }
    const node: TrailNode = { id, parentId, childIds: [], collapsed: false };
    this.nodes.set(id, node);
    this.siblingsOf(parentId).push(id);
    return node;
  }

  /**
   * Removes a node. Its children take its place in the parent so the trail
   * that led to them is preserved rather than silently discarded.
   */
  remove(id: PageId): void {
    const node = this.require(id);
    const siblings = this.siblingsOf(node.parentId);
    const index = siblings.indexOf(id);
    siblings.splice(index, 1, ...node.childIds);
    for (const childId of node.childIds) {
      this.require(childId).parentId = node.parentId;
    }
    this.nodes.delete(id);
  }

  /** Removes a node and everything nested under it; returns the removed ids. */
  removeSubtree(id: PageId): PageId[] {
    const node = this.require(id);
    const removed = this.descendantsOf(id);
    removed.unshift(id);
    const siblings = this.siblingsOf(node.parentId);
    siblings.splice(siblings.indexOf(id), 1);
    for (const removedId of removed) this.nodes.delete(removedId);
    return removed;
  }

  /**
   * Moves a node, with its subtree, to be a child of `parentId` placed before
   * `beforeId`, or last when `beforeId` is `null`.
   */
  move(id: PageId, parentId: PageId | null, beforeId: PageId | null): void {
    const node = this.require(id);
    if (parentId !== null) {
      this.require(parentId);
      if (parentId === id || this.isDescendant(parentId, id)) {
        throw new Error(`Cannot move ${id} into its own subtree`);
      }
    }
    if (beforeId === id) return;
    const target = this.siblingsOf(parentId);
    if (beforeId !== null && !target.includes(beforeId)) {
      throw new Error(
        `${beforeId} is not a child of ${parentId ?? 'the root'}`,
      );
    }

    const current = this.siblingsOf(node.parentId);
    current.splice(current.indexOf(id), 1);
    const index = beforeId === null ? target.length : target.indexOf(beforeId);
    target.splice(index, 0, id);
    node.parentId = parentId;
  }

  /** Whether `id` sits somewhere below `ancestorId`. */
  isDescendant(id: PageId, ancestorId: PageId): boolean {
    let parentId = this.require(id).parentId;
    while (parentId !== null) {
      if (parentId === ancestorId) return true;
      parentId = this.require(parentId).parentId;
    }
    return false;
  }

  /** Every node nested under `id`, depth-first. */
  descendantsOf(id: PageId): PageId[] {
    const result: PageId[] = [];
    const visit = (ids: readonly PageId[]) => {
      for (const childId of ids) {
        result.push(childId);
        visit(this.require(childId).childIds);
      }
    };
    visit(this.require(id).childIds);
    return result;
  }

  setCollapsed(id: PageId, collapsed: boolean): void {
    this.require(id).collapsed = collapsed;
  }

  /** Expands every ancestor so that `id` is visible in the sidebar. */
  reveal(id: PageId): void {
    let parentId = this.require(id).parentId;
    while (parentId !== null) {
      const parent = this.require(parentId);
      parent.collapsed = false;
      parentId = parent.parentId;
    }
  }

  /** Every node in depth-first, sidebar order. */
  order(): PageId[] {
    const result: PageId[] = [];
    const visit = (ids: readonly PageId[]) => {
      for (const id of ids) {
        result.push(id);
        visit(this.require(id).childIds);
      }
    };
    visit(this.roots);
    return result;
  }

  /**
   * The page that should become active when `id` is removed: its first child
   * (which inherits its place), else the next sibling, else the previous
   * sibling, else its parent. With `withDescendants` its children are going
   * too, so they are skipped.
   */
  successorOf(id: PageId, withDescendants = false): PageId | null {
    const node = this.require(id);
    if (!withDescendants && node.childIds.length > 0) {
      return node.childIds[0] ?? null;
    }
    const siblings = this.siblingsOf(node.parentId);
    const index = siblings.indexOf(id);
    return siblings[index + 1] ?? siblings[index - 1] ?? node.parentId;
  }

  private siblingsOf(parentId: PageId | null): PageId[] {
    return parentId === null ? this.roots : this.require(parentId).childIds;
  }

  private require(id: PageId): TrailNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} does not exist`);
    return node;
  }
}
