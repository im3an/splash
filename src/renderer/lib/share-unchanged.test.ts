import { describe, expect, it } from 'vitest';
import { shareById, shareUnchanged } from './share-unchanged';

describe('keeping what didn’t change', () => {
  it('returns the old value when nothing changed', () => {
    const old = { a: 1, b: { c: [1, { d: 2 }] }, e: null };
    expect(shareUnchanged(old, structuredClone(old))).toBe(old);
  });

  it('keeps the unchanged parts of a changed value', () => {
    const old = {
      pages: { a: { title: 'A' }, b: { title: 'B' } },
      active: 'a',
    };
    const next = {
      pages: { a: { title: 'A' }, b: { title: 'New' } },
      active: 'a',
    };
    const shared = shareUnchanged(old, next);
    expect(shared).toEqual(next);
    expect(shared).not.toBe(old);
    expect(shared.pages.a).toBe(old.pages.a);
    expect(shared.pages.b).not.toBe(old.pages.b);
  });

  it('notices keys that came and went', () => {
    const old: Record<string, number> = { a: 1, b: 2 };
    expect(shareUnchanged(old, { a: 1 })).toEqual({ a: 1 });
    expect(shareUnchanged(old, { a: 1, b: 2, c: 3 })).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
    expect(shareUnchanged(old, { a: 1, c: 2 })).toEqual({ a: 1, c: 2 });
  });

  it('notices a field that became undefined rather than absent', () => {
    const old: { a?: number; b?: number } = { a: 1 };
    const next = { a: undefined, b: undefined };
    expect(Object.keys(shareUnchanged(old, next))).toEqual(['a', 'b']);
  });

  it('keeps array elements by position and notices a new length', () => {
    const first = { id: 'x' };
    const old = [first, { id: 'y' }];
    const longer = shareUnchanged(old, [{ id: 'x' }, { id: 'y' }, { id: 'z' }]);
    expect(longer).toHaveLength(3);
    expect(longer[0]).toBe(first);
    expect(shareUnchanged(old, [{ id: 'x' }])).toEqual([{ id: 'x' }]);
  });

  it('doesn’t confuse values of different kinds', () => {
    const shareAny = shareUnchanged as (old: unknown, next: unknown) => unknown;
    expect(shareAny([], {})).toEqual({});
    expect(shareAny({}, [])).toEqual([]);
    expect(shareAny(null, {})).toEqual({});
    expect(shareAny({ a: 1 }, null)).toBeNull();
    expect(shareAny(0, '')).toBe('');
  });

  it('starts from nothing without trouble', () => {
    const next = { a: 1 };
    expect(shareUnchanged(null, next)).toBe(next);
  });
});

describe('keeping list items by their id', () => {
  const row = (id: string, depth = 0) => ({ id, depth });

  it('keeps each item when others are put in before it', () => {
    const a = row('a');
    const b = row('b');
    const shared = shareById([a, b], [row('new'), row('a'), row('b')]);
    expect(shared.map((item) => item.id)).toEqual(['new', 'a', 'b']);
    expect(shared[1]).toBe(a);
    expect(shared[2]).toBe(b);
  });

  it('takes the new item when it changed', () => {
    const a = row('a');
    const shared = shareById([a], [row('a', 2)]);
    expect(shared[0]).not.toBe(a);
    expect(shared[0]?.depth).toBe(2);
  });

  it('returns the old list when it’s the same in the same order', () => {
    const old = [row('a'), row('b')];
    expect(shareById(old, [row('a'), row('b')])).toBe(old);
  });

  it('returns a new list when only the order changed', () => {
    const a = row('a');
    const b = row('b');
    const shared = shareById([a, b], [row('b'), row('a')]);
    expect(shared).toEqual([b, a]);
    expect(shared[0]).toBe(b);
    expect(shared[1]).toBe(a);
  });
});
