import { describe, expect, it } from 'vitest';
import {
  type Point,
  enclosingCircle,
  roundedHull,
  separateGroups,
} from './alma-view-physics';

/** Ray casting; points on the edge count as outside, which is stricter. */
function inside(polygon: Point[], p: Point) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      hit = !hit;
    }
  }
  return hit;
}

/** Every point of a circle of `r` around each member is inside. */
function covers(polygon: Point[], members: Point[], r: number) {
  return members.every((m) =>
    Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2).every((a) =>
      inside(polygon, { x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r }),
    ),
  );
}

describe('roundedHull', () => {
  it('covers every member of a long thin group, sides included', () => {
    // The old outline pushed corners out from the middle, which left the
    // middle of a long side with nothing around it.
    const members = [
      { x: 0, y: 0 },
      { x: 400, y: 10 },
      { x: 200, y: 4 },
      { x: 120, y: -6 },
      { x: 300, y: 14 },
    ];
    expect(covers(roundedHull(members, 30), members, 29)).toBe(true);
  });

  it('covers a sharp corner', () => {
    const members = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 40 },
    ];
    expect(covers(roundedHull(members, 25), members, 24)).toBe(true);
  });

  it('covers scattered groups of any size', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let size = 1; size <= 30; size++) {
      const members = Array.from({ length: size }, () => ({
        x: random() * 600 - 300,
        y: random() * 300 - 150,
      }));
      expect(covers(roundedHull(members, 27), members, 26)).toBe(true);
    }
  });

  it('draws two points as a capsule and one as a circle', () => {
    const pair = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(covers(roundedHull(pair, 20), pair, 19)).toBe(true);
    expect(
      covers(roundedHull([{ x: 5, y: 5 }], 20), [{ x: 5, y: 5 }], 19),
    ).toBe(true);
    expect(roundedHull([], 20)).toEqual([]);
  });
});

describe('separateGroups', () => {
  const group = (x: number, y: number, count: number) => {
    const members = Array.from({ length: count }, (_, i) => ({
      x: x + Math.cos(i) * 40,
      y: y + Math.sin(i) * 40,
      r: 10,
    }));
    return { members, circle: enclosingCircle(members) };
  };

  it('parts overlapping groups until they keep the gap, without reshaping them', () => {
    const groups = [group(0, 0, 6), group(30, 10, 4), group(0, 0, 1)];
    const before = groups.map((g) =>
      g.members.map((m) => ({
        x: m.x - g.members[0]!.x,
        y: m.y - g.members[0]!.y,
      })),
    );
    for (let i = 0; i < 200; i++) separateGroups(groups, 20, 0.5);
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = enclosingCircle(groups[i]!.members);
        const b = enclosingCircle(groups[j]!.members);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
          a.r + b.r + 19.5,
        );
      }
    }
    groups.forEach((g, i) =>
      g.members.forEach((m, k) => {
        expect(m.x - g.members[0]!.x).toBeCloseTo(before[i]![k]!.x);
        expect(m.y - g.members[0]!.y).toBeCloseTo(before[i]![k]!.y);
      }),
    );
  });

  it('leaves groups that already keep their distance', () => {
    const groups = [group(0, 0, 3), group(500, 0, 3)];
    const x = groups[1]!.members[0]!.x;
    expect(separateGroups(groups, 20, 0.5)).toBe(0);
    expect(groups[1]!.members[0]!.x).toBe(x);
  });

  it('never moves a member being held', () => {
    const groups = [group(0, 0, 3), group(10, 0, 3)];
    const held = groups[0]!.members[0]!;
    const { x, y } = held;
    separateGroups(groups, 20, 0.5, (m) => m === held);
    expect(held).toMatchObject({ x, y });
  });
});
