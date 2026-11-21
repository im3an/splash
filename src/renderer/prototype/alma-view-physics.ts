/*
 * Geometry for the free-floating graph modes, kept apart from the canvas so
 * it can be checked without one.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Disc extends Point {
  /** How far the drawn node reaches from its centre. */
  r: number;
}

/** Monotone chain; returns the corners in order, without repeats. */
export function convexHull<T extends Point>(input: readonly T[]): Point[] {
  const points = input
    .map(({ x, y }) => ({ x, y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length < 3) {
    const [a, b] = points;
    if (a && b && a.x === b.x && a.y === b.y) return [a];
    return points;
  }
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const point of list) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0
      ) {
        out.pop();
      }
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(points), ...half([...points].reverse())];
}

/**
 * The outline of a group: its convex hull grown by `radius` on every side,
 * with round corners. Every point within `radius` of a member is inside, which
 * pushing corners out from the middle never promised for long thin groups.
 */
export function roundedHull(points: readonly Point[], radius: number) {
  const shell = convexHull(points);
  if (!shell.length) return [];
  const out: Point[] = [];
  const arc = (c: Point, from: number, sweep: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
    for (let i = 0; i <= steps; i++) {
      const angle = from + (sweep * i) / steps;
      out.push({
        x: c.x + Math.cos(angle) * radius,
        y: c.y + Math.sin(angle) * radius,
      });
    }
  };
  if (shell.length === 1) {
    arc(shell[0]!, 0, Math.PI * 2);
    out.pop();
    return out;
  }
  // Monotone chain turns the way of increasing angle, so the outside of a
  // side running (dx, dy) is (dy, -dx).
  const n = shell.length;
  const normal = (i: number) => {
    const a = shell[i]!;
    const b = shell[(i + 1) % n]!;
    return Math.atan2(-(b.x - a.x), b.y - a.y);
  };
  for (let i = 0; i < n; i++) {
    const from = normal((i - 1 + n) % n);
    let sweep = normal(i) - from;
    while (sweep < 0) sweep += Math.PI * 2;
    while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
    // Two points: each end turns a half circle.
    if (n === 2) sweep = Math.PI;
    arc(shell[i]!, from, sweep);
  }
  return out;
}

/** The circle a group sits in: from its middle out past its widest member. */
export function enclosingCircle(members: readonly Disc[]) {
  let x = 0;
  let y = 0;
  for (const m of members) {
    x += m.x;
    y += m.y;
  }
  x /= members.length;
  y /= members.length;
  let r = 0;
  for (const m of members) r = Math.max(r, Math.hypot(m.x - x, m.y - y) + m.r);
  return { x, y, r };
}

/**
 * Moves whole groups so their circles keep `gap` apart, each by half the
 * overlap times `strength`. Groups move rigidly, so a trail keeps its shape
 * while it finds room. Returns how far the worst pair still overlaps.
 */
export function separateGroups<T extends Point>(
  groups: readonly {
    members: T[];
    circle: { x: number; y: number; r: number };
  }[],
  gap: number,
  strength: number,
  isFixed: (member: T) => boolean = () => false,
) {
  let worst = 0;
  const shift = groups.map(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i]!.circle;
    for (let j = i + 1; j < groups.length; j++) {
      const b = groups[j]!.circle;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const reach = a.r + b.r + gap;
      if (d >= reach) continue;
      if (d < 0.01) {
        // Stacked exactly: part them along a direction fixed by the pair.
        const angle = (i * 2.399 + j * 1.13) % (Math.PI * 2);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1;
      }
      const overlap = reach - d;
      worst = Math.max(worst, overlap);
      // The bigger group gives way less.
      const total = a.r * a.r + b.r * b.r || 1;
      const forA = (b.r * b.r) / total;
      const forB = (a.r * a.r) / total;
      const ux = dx / d;
      const uy = dy / d;
      shift[i]!.x -= ux * overlap * strength * forA;
      shift[i]!.y -= uy * overlap * strength * forA;
      shift[j]!.x += ux * overlap * strength * forB;
      shift[j]!.y += uy * overlap * strength * forB;
    }
  }
  groups.forEach((group, i) => {
    const { x, y } = shift[i]!;
    if (!x && !y) return;
    for (const member of group.members) {
      if (isFixed(member)) continue;
      member.x += x;
      member.y += y;
    }
    group.circle.x += x;
    group.circle.y += y;
  });
  return worst;
}
