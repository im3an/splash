import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offerUndo, resetTrailUndo, undoLast } from './trail-undo';

describe('trail undo', () => {
  beforeEach(resetTrailUndo);

  it('undoes the newest change first', () => {
    const first = vi.fn();
    const second = vi.fn();
    offerUndo('first', first);
    offerUndo('second', second);
    expect(undoLast()).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(undoLast()).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(undoLast()).toBe(false);
  });

  it('runs an undo once, from the toast or from ⌘Z', () => {
    const run = vi.fn();
    const fromToast = offerUndo('close', run);
    fromToast();
    fromToast();
    expect(undoLast()).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });

  it('keeps only recent changes', () => {
    const oldest = vi.fn();
    offerUndo('oldest', oldest);
    for (let index = 0; index < 20; index++) offerUndo(`${index}`, vi.fn());
    while (undoLast());
    expect(oldest).not.toHaveBeenCalled();
  });
});
