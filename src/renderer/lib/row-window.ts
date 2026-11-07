/**
 * Which rows of a long list are near enough to the scroller's edges to draw.
 * Each row keeps a slot in the list at all times, so scrolling and positions
 * stay true, and only the slots near the viewport hold a real row. A row costs
 * about 20 elements and a drag-library subscription; a slot costs one element.
 */

/** How far past the scroller's edges rows stay drawn, about 20 rows each way. */
const REACH_PX = 640;
/** Rows slide in sideways when a workspace changes; that isn't leaving. */
const SIDEWAYS_REACH_PX = 4000;

export class RowWindow {
  private readonly near = new Set<string>();
  private readonly listeners = new Map<string, () => void>();
  private readonly watched = new Map<Element, string>();
  private observer: IntersectionObserver | null = null;
  private root: Element | null = null;
  private readonly windowed = typeof IntersectionObserver !== 'undefined';

  /**
   * @param rootSelector The scroller, found from a slot. Without one the list
   * isn't being scrolled here, and every row draws.
   */
  constructor(private readonly rootSelector: string) {}

  isNear(id: string): boolean {
    return !this.windowed || this.near.has(id);
  }

  subscribe(id: string, listener: () => void): () => void {
    this.listeners.set(id, listener);
    return () => {
      if (this.listeners.get(id) === listener) this.listeners.delete(id);
    };
  }

  /**
   * Follows a slot until the returned function is called. Called before paint:
   * it says where the slot is at once, since the observer's first answer only
   * comes after a frame, which would flash an empty list.
   */
  watch(id: string, slot: Element): () => void {
    if (!this.windowed) return () => undefined;
    const root = slot.closest(this.rootSelector);
    if (!root) {
      this.set(id, true);
      return () => this.near.delete(id);
    }
    this.observe(root).observe(slot);
    this.watched.set(slot, id);
    this.set(id, withinReach(slot, root));
    return () => {
      this.observer?.unobserve(slot);
      this.watched.delete(slot);
      this.near.delete(id);
      if (this.watched.size === 0) {
        this.observer?.disconnect();
        this.observer = null;
        this.root = null;
      }
    };
  }

  private observe(root: Element): IntersectionObserver {
    if (this.observer && this.root === root) return this.observer;
    this.observer?.disconnect();
    this.root = root;
    this.observer = new IntersectionObserver(
      (entries) => {
        // Hidden under a panel: the rows are cheap to keep, and are there the
        // moment it closes, in the same place.
        if (root.clientHeight === 0) return;
        for (const entry of entries) {
          const id = this.watched.get(entry.target);
          if (id !== undefined) this.set(id, entry.isIntersecting);
        }
      },
      { root, rootMargin: `${REACH_PX}px ${SIDEWAYS_REACH_PX}px` },
    );
    for (const slot of this.watched.keys()) this.observer.observe(slot);
    return this.observer;
  }

  private set(id: string, near: boolean): void {
    if (this.near.has(id) === near) return;
    if (near) this.near.add(id);
    else this.near.delete(id);
    this.listeners.get(id)?.();
  }
}

function withinReach(slot: Element, root: Element): boolean {
  const area = root.getBoundingClientRect();
  // Hidden under a panel: the observer says when it's back.
  if (area.height === 0) return false;
  const { top, bottom } = slot.getBoundingClientRect();
  return bottom >= area.top - REACH_PX && top <= area.bottom + REACH_PX;
}
