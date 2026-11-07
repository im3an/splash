/**
 * A reload runs in the process of the page it replaces, so a page stuck in a loop
 * never answers one: it stays on "loading" for as long as you let it. The way out
 * is to end the process first, and to go only once it has gone, because a
 * navigation started before that dies with it. That ending shouldn't read as a
 * crash, since the page is already on its way somewhere else.
 */
export class HungRenderer {
  private hung = false;
  private afterEnding: (() => void) | null = null;

  constructor(private readonly contents: { forcefullyCrashRenderer(): void }) {}

  stoppedAnswering(): void {
    this.hung = true;
  }

  answeredAgain(): void {
    this.hung = false;
  }

  /** Navigates now, or once a hung page's process has been ended. */
  leave(go: () => void): void {
    if (this.afterEnding) {
      this.afterEnding = go;
    } else if (this.hung) {
      this.afterEnding = go;
      this.contents.forcefullyCrashRenderer();
    } else {
      go();
    }
  }

  /** The page's process is gone: because `leave` ended it, or by a real crash. */
  processGone(): 'ended' | 'crashed' {
    this.hung = false;
    const go = this.afterEnding;
    this.afterEnding = null;
    go?.();
    return go ? 'ended' : 'crashed';
  }
}
