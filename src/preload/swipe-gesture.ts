/*
 * Trackpad swipes over a page, read from its wheel events: two fingers
 * sideways past the edge of everything that scrolls go back or forward, as in
 * Safari; pulled down past the top of the page, they reload.
 *
 * A gesture is a run of wheel events without a pause, momentum included. Only
 * a run that *starts* at an edge counts, so scrolling up a long page and
 * coasting into the top never reloads it, and a carousel scrolled to its end
 * doesn't go back unless the fingers lift and swipe again.
 */

export type SwipeKind = 'back' | 'forward' | 'reload';

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  /** Milliseconds, as `event.timeStamp`. */
  time: number;
  /** Whether nothing under the pointer can scroll further that way. */
  atEdge: { left: boolean; right: boolean; top: boolean };
}

export interface SwipeState {
  kind: SwipeKind;
  /** 0 at the start, 1 where letting go navigates. */
  progress: number;
}

/**
 * A pause this long ends a gesture. Momentum events come every ~16ms; slow
 * fingers can leave gaps of a few frames, which mustn't end the swipe.
 */
export const GESTURE_GAP_MS = 240;
/** Pixels of travel before the direction is decided, and the most it waits. */
const DECIDE_AFTER = 6;
const DECIDE_BY = 32;
/** Travel to go back or forward, and the longer pull to reload. */
export const SIDEWAYS_DISTANCE = 140;
export const PULL_DISTANCE = 190;

type Phase =
  | { name: 'idle' }
  | { name: 'deciding'; x: number; y: number; atEdge: WheelSample['atEdge'] }
  | { name: 'tracking'; kind: SwipeKind; travel: number }
  | { name: 'ignored' }
  | { name: 'done' };

export class SwipeTracker {
  private phase: Phase = { name: 'idle' };
  private lastTime = -Infinity;

  /**
   * Feeds one wheel event the page didn't take for itself. Returns what's
   * happening now: a swipe in progress, a finished one (`done`), or nothing.
   */
  feed(sample: WheelSample): {
    state: SwipeState | null;
    done: SwipeKind | null;
  } {
    if (sample.time - this.lastTime > GESTURE_GAP_MS) {
      this.phase = {
        name: 'deciding',
        x: 0,
        y: 0,
        atEdge: sample.atEdge,
      };
    }
    this.lastTime = sample.time;
    const phase = this.phase;

    if (phase.name === 'deciding') {
      phase.x += sample.deltaX;
      phase.y += sample.deltaY;
      const ax = Math.abs(phase.x);
      const ay = Math.abs(phase.y);
      if (Math.max(ax, ay) < DECIDE_AFTER) return { state: null, done: null };
      const kind = decide(phase.x, phase.y, phase.atEdge);
      // A diagonal start may still straighten out: wait a little longer.
      if (kind === 'unsure' && Math.max(ax, ay) < DECIDE_BY)
        return { state: null, done: null };
      if (!kind || kind === 'unsure') {
        this.phase = { name: 'ignored' };
        return { state: null, done: null };
      }
      this.phase = { name: 'tracking', kind, travel: along(kind, phase) };
      return this.progress();
    }
    if (phase.name === 'tracking') {
      phase.travel = Math.max(
        0,
        phase.travel + along(phase.kind, { x: sample.deltaX, y: sample.deltaY }),
      );
      return this.progress();
    }
    return { state: null, done: null };
  }

  /** The page took the gesture over: ignore the rest of it. */
  cancel(): void {
    this.phase = { name: 'ignored' };
  }

  /** Whether a pause since `time` has ended the current gesture. */
  endedBy(time: number): boolean {
    return time - this.lastTime > GESTURE_GAP_MS;
  }

  private progress(): { state: SwipeState | null; done: SwipeKind | null } {
    const phase = this.phase;
    if (phase.name !== 'tracking') return { state: null, done: null };
    const distance =
      phase.kind === 'reload' ? PULL_DISTANCE : SIDEWAYS_DISTANCE;
    const progress = Math.min(1, phase.travel / distance);
    // Momentum keeps coming after the fingers lift, so waiting for the end
    // of the run would navigate a second after the swipe. Past the mark is
    // the decision; the rest of the run is spent.
    if (progress >= 1) {
      this.phase = { name: 'done' };
      return { state: { kind: phase.kind, progress: 1 }, done: phase.kind };
    }
    return { state: { kind: phase.kind, progress }, done: null };
  }
}

function decide(
  x: number,
  y: number,
  atEdge: WheelSample['atEdge'],
): SwipeKind | 'unsure' | null {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > ay * 1.25) {
    // Fingers moving right scroll left: back, as in Safari.
    if (x < 0 && atEdge.left) return 'back';
    if (x > 0 && atEdge.right) return 'forward';
    return null;
  }
  if (ay > ax * 1.25) return y < 0 && atEdge.top ? 'reload' : null;
  return 'unsure';
}

function along(kind: SwipeKind, delta: { x: number; y: number }): number {
  if (kind === 'back') return -delta.x;
  if (kind === 'forward') return delta.x;
  return -delta.y;
}
