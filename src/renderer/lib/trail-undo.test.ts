import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offerUndo, redoLast, resetTrailUndo, undoLast } from './trail-undo';

describe('trail undo', () => {
  beforeEach(resetTrailUndo);

  it('undoes the newest change first', async () => {
    const first = vi.fn();
    const second = vi.fn();
    offerUndo('first', first);
    offerUndo('second', second);
    expect(await undoLast()).toMatchObject({ kind: 'undone', label: 'second' });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(await undoLast()).toMatchObject({ kind: 'undone', label: 'first' });
    expect(first).toHaveBeenCalledOnce();
    expect(await undoLast()).toMatchObject({ kind: 'nothing' });
  });

  it('runs an undo once, from the toast or from ⌘Z', async () => {
    const run = vi.fn();
    const fromToast = offerUndo('close', run);
    await fromToast();
    expect(await fromToast()).toMatchObject({ kind: 'nothing' });
    expect(await undoLast()).toMatchObject({ kind: 'nothing' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('keeps only recent changes', async () => {
    const oldest = vi.fn();
    offerUndo('oldest', oldest);
    for (let index = 0; index < 20; index++) offerUndo(`${index}`, vi.fn());
    while ((await undoLast()).kind !== 'nothing');
    expect(oldest).not.toHaveBeenCalled();
  });

  it('skips a change that was already undone some other way', async () => {
    const older = vi.fn();
    offerUndo('older', older);
    offerUndo('reopened with ⇧⌘T', () => false);
    expect(await undoLast()).toMatchObject({ kind: 'undone', label: 'older' });
    expect(older).toHaveBeenCalledOnce();
  });

  it('says so when an undo fails, and drops it', async () => {
    offerUndo('moved', () => Promise.reject(new Error('gone')));
    expect(await undoLast()).toMatchObject({
      kind: 'undo-failed',
      label: 'moved',
    });
    expect(await undoLast()).toMatchObject({ kind: 'nothing' });
    expect(await redoLast()).toMatchObject({ kind: 'nothing' });
  });
});

describe('trail redo', () => {
  beforeEach(resetTrailUndo);

  it('redoes what was undone, newest undo first', async () => {
    const log: string[] = [];
    const change = (name: string) =>
      offerUndo(
        name,
        () => void log.push(`undo ${name}`),
        () => void log.push(`redo ${name}`),
      );
    change('a');
    change('b');
    await undoLast();
    await undoLast();
    expect(await redoLast()).toMatchObject({ kind: 'redone', label: 'a' });
    expect(await redoLast()).toMatchObject({ kind: 'redone', label: 'b' });
    expect(await redoLast()).toMatchObject({ kind: 'nothing' });
    expect(log).toEqual(['undo b', 'undo a', 'redo a', 'redo b']);
  });

  it('can undo and redo the same change again and again', async () => {
    const undo = vi.fn();
    const redo = vi.fn();
    offerUndo('pin', undo, redo);
    await undoLast();
    await redoLast();
    await undoLast();
    await redoLast();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('can redo an undo made from the toast', async () => {
    const redo = vi.fn();
    const fromToast = offerUndo('rename', vi.fn(), redo);
    expect(await fromToast()).toMatchObject({
      kind: 'undone',
      canRedo: true,
    });
    await redoLast();
    expect(redo).toHaveBeenCalledOnce();
  });

  it('forgets what could be redone when something new is done', async () => {
    const redo = vi.fn();
    offerUndo('old', vi.fn(), redo);
    await undoLast();
    offerUndo('new', vi.fn(), vi.fn());
    expect(await redoLast()).toMatchObject({ kind: 'nothing' });
    expect(redo).not.toHaveBeenCalled();
  });

  it('has nothing to redo after an undo with no way forward', async () => {
    const redo = vi.fn();
    offerUndo('redoable', vi.fn(), redo);
    offerUndo('one way', vi.fn());
    await undoLast();
    expect(await undoLast()).toMatchObject({ canRedo: true });
    await redoLast();
    expect(redo).toHaveBeenCalledOnce();

    resetTrailUndo();
    offerUndo('redoable', vi.fn(), redo);
    await undoLast();
    offerUndo('one way', vi.fn());
    expect(await undoLast()).toMatchObject({ kind: 'undone', canRedo: false });
    expect(await redoLast()).toMatchObject({ kind: 'nothing' });
  });

  it.each([
    ['reports it could not', () => false],
    ['fails', () => Promise.reject(new Error('gone'))],
  ])('says so when a redo %s', async (_name, redo) => {
    offerUndo('closed', vi.fn(), redo);
    await undoLast();
    expect(await redoLast()).toMatchObject({
      kind: 'redo-failed',
      label: 'closed',
    });
    expect(await undoLast()).toMatchObject({ kind: 'nothing' });
  });

  it('takes presses in turn, even while one is still running', async () => {
    const log: string[] = [];
    const slow = (text: string) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(text);
    };
    offerUndo('a', slow('undo a'), slow('redo a'));
    offerUndo('b', slow('undo b'), slow('redo b'));
    await Promise.all([undoLast(), undoLast(), redoLast()]);
    expect(log).toEqual(['undo b', 'undo a', 'redo a']);
  });
});
