import type { PageId } from '../../shared/types';

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

  /**
   * Adds a node under `parentId` (or as a root) at `index` among its
   * siblings; by default after the last one.
   */
  add(
    id: PageId,
    parentId: PageId | null = null,
    index?: number,
  ): Readonly<TrailNode> {
    if (this.nodes.has(id)) throw new Error(`Node ${id} already exists`);
    const siblings = this.siblingsOf(parentId);
    const node: TrailNode = { id, parentId, childIds: [], collapsed: false };
    this.nodes.set(id, node);
    siblings.splice(clampIndex(index, siblings.length), 0, id);
    return node;
  }

  /** Position of a node among its siblings. */
  indexOf(id: PageId): number {
    return this.siblingsOf(this.require(id).parentId).indexOf(id);
  }

  /** Whether `id` is `ancestorId` or lies beneath it. */
  isWithin(id: PageId, ancestorId: PageId): boolean {
    let current: PageId | null = id;
    while (current !== null) {
      if (current === ancestorId) return true;
      current = this.require(current).parentId;
    }
    return false;
  }

  /**
   * Moves a node, with everything beneath it, to `index` among the children
   * of `parentId`. The index counts siblings after the node has left its
   * old place. Moving a node into its own branch is rejected.
   */
  move(id: PageId, parentId: PageId | null, index: number): void {
    const node = this.require(id);
    if (parentId !== null && this.isWithin(parentId, id)) {
      throw new Error(`Cannot move ${id} into its own branch`);
    }
    const target = this.siblingsOf(parentId);
    const source = this.siblingsOf(node.parentId);
    source.splice(source.indexOf(id), 1);
    target.splice(clampIndex(index, target.length), 0, id);
    node.parentId = parentId;
  }

  /** A node and everything beneath it, in depth-first order. */
  branch(id: PageId): PageId[] {
    const result: PageId[] = [];
    const visit = (nodeId: PageId) => {
      result.push(nodeId);
      for (const childId of this.require(nodeId).childIds) visit(childId);
    };
    visit(id);
    return result;
  }

  /** Removes a node together with everything beneath it. */
  removeBranch(id: PageId): PageId[] {
    const removed = this.branch(id);
    const node = this.require(id);
    const siblings = this.siblingsOf(node.parentId);
    siblings.splice(siblings.indexOf(id), 1);
    for (const nodeId of removed) this.nodes.delete(nodeId);
    return removed;
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
   * sibling, else its parent.
   */
  successorOf(id: PageId): PageId | null {
    const node = this.require(id);
    if (node.childIds.length > 0) return node.childIds[0] ?? null;
    const siblings = this.siblingsOf(node.parentId);
    const index = siblings.indexOf(id);
    return siblings[index + 1] ?? siblings[index - 1] ?? node.parentId;
  }

  /** Like `successorOf`, for when the node's whole branch goes with it. */
  branchSuccessorOf(id: PageId): PageId | null {
    const node = this.require(id);
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

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}
