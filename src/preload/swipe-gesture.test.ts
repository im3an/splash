import { describe, expect, it } from 'vitest';
import {
  GESTURE_GAP_MS,
  PULL_DISTANCE,
  SIDEWAYS_DISTANCE,
  SwipeTracker,
  type SwipeKind,
  type WheelSample,
} from './swipe-gesture';

const EDGES = { left: true, right: true, top: true };

function run(
  tracker: SwipeTracker,
  steps: number,
  delta: { x?: number; y?: number },
  options: { start?: number; atEdge?: WheelSample['atEdge'] } = {},
) {
  let done: SwipeKind | null = null;
  let progress = 0;
  for (let i = 0; i < steps; i++) {
    const result = tracker.feed({
      deltaX: delta.x ?? 0,
      deltaY: delta.y ?? 0,
      time: (options.start ?? 0) + i * 16,
      atEdge: options.atEdge ?? EDGES,
    });
    if (result.state) progress = result.state.progress;
    done ??= result.done;
  }
  return { done, progress };
}

describe('SwipeTracker', () => {
  it('goes back when fingers swipe right at the left edge', () => {
    const steps = Math.ceil(SIDEWAYS_DISTANCE / 10) + 1;
    expect(run(new SwipeTracker(), steps, { x: -10 }).done).toBe('back');
  });

  it('goes forward when fingers swipe left at the right edge', () => {
    const steps = Math.ceil(SIDEWAYS_DISTANCE / 10) + 1;
    expect(run(new SwipeTracker(), steps, { x: 10 }).done).toBe('forward');
  });

  it('shows progress short of the mark without navigating', () => {
    const { done, progress } = run(new SwipeTracker(), 6, { x: -10 });
    expect(done).toBeNull();
    expect(progress).toBeGreaterThan(0.3);
    expect(progress).toBeLessThan(1);
  });

  it('reloads on a long pull down at the top', () => {
    const steps = Math.ceil(PULL_DISTANCE / 10) + 1;
    expect(run(new SwipeTracker(), steps, { y: -10 }).done).toBe('reload');
  });

  it('ignores a swipe that starts where something can still scroll', () => {
    const atEdge = { left: false, right: true, top: false };
    expect(run(new SwipeTracker(), 40, { x: -10 }, { atEdge }).done).toBeNull();
    expect(run(new SwipeTracker(), 40, { y: -10 }, { atEdge }).done).toBeNull();
  });

  it('does not reload when coasting up into the top', () => {
    const tracker = new SwipeTracker();
    const below = { left: true, right: true, top: false };
    run(tracker, 5, { y: -10 }, { atEdge: below });
    // Same run, now at the top: momentum, not a fresh pull.
    expect(run(tracker, 40, { y: -10 }, { start: 80 }).done).toBeNull();
  });

  it('takes a new gesture after a pause', () => {
    const tracker = new SwipeTracker();
    const below = { left: true, right: true, top: false };
    run(tracker, 5, { y: -10 }, { atEdge: below });
    const later = 80 + GESTURE_GAP_MS + 50;
    expect(run(tracker, 40, { y: -10 }, { start: later }).done).toBe('reload');
  });

  it('ignores mostly vertical scrolling for back and forward', () => {
    expect(run(new SwipeTracker(), 40, { x: -6, y: 8 }).done).toBeNull();
  });

  it('navigates once per gesture, however long the momentum', () => {
    const tracker = new SwipeTracker();
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const { done } = tracker.feed({
        deltaX: -10,
        deltaY: 0,
        time: i * 16,
        atEdge: EDGES,
      });
      if (done) count++;
    }
    expect(count).toBe(1);
  });

  it('can be taken back by reversing before the mark', () => {
    const tracker = new SwipeTracker();
    run(tracker, 8, { x: -10 });
    const { done, progress } = run(tracker, 8, { x: 10 }, { start: 128 });
    expect(done).toBeNull();
    expect(progress).toBe(0);
  });

  it('stops tracking once the page takes the gesture', () => {
    const tracker = new SwipeTracker();
    run(tracker, 3, { x: -10 });
    tracker.cancel();
    expect(run(tracker, 40, { x: -10 }, { start: 48 }).done).toBeNull();
  });

  it('waits out a diagonal start that then straightens', () => {
    const tracker = new SwipeTracker();
    run(tracker, 2, { x: -4, y: 4 });
    const steps = Math.ceil(SIDEWAYS_DISTANCE / 10) + 4;
    expect(run(tracker, steps, { x: -10 }, { start: 32 }).done).toBe('back');
  });

  it('keeps a swipe through a short rest of the fingers', () => {
    const tracker = new SwipeTracker();
    run(tracker, 6, { x: -10 });
    const later = 80 + GESTURE_GAP_MS - 40;
    const { done, progress } = run(tracker, 4, { x: -10 }, { start: later });
    expect(done).toBeNull();
    expect(progress).toBeGreaterThan(0.6);
  });
});
