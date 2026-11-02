import { EventEmitter } from 'node:events';
import { requestPageClose } from './close-page';
class Contents extends EventEmitter {
  destroyed = false;
  blocks = false;
  hangs = false;
  isDestroyed() {
    return this.destroyed;
  }
  close({ waitForBeforeUnload }: { waitForBeforeUnload: boolean }) {
    if (this.hangs && waitForBeforeUnload) return;
    if (this.blocks && waitForBeforeUnload) {
      let leave = false;
      this.emit('will-prevent-unload', {
        preventDefault: () => {
          leave = true;
        },
      });
      if (!leave) return;
    }
    this.destroyed = true;
    this.emit('destroyed');
  }
}
afterEach(() => vi.useRealTimers());
describe('native close lifecycle', () => {
  it('lets Chromium close pages with no veto and cleans listeners', async () => {
    const contents = new Contents();
    const decide = vi.fn(() => false);
    expect(await requestPageClose(contents, decide)).toBe(true);
    expect(decide).not.toHaveBeenCalled();
    expect(contents.listenerCount('destroyed')).toBe(0);
  });
  it('keeps the live view and input when the user chooses Stay', async () => {
    const contents = new Contents();
    contents.blocks = true;
    expect(await requestPageClose(contents, () => false)).toBe(false);
    expect(contents.destroyed).toBe(false);
    expect(contents.listenerCount('will-prevent-unload')).toBe(0);
  });
  it('allows leaving only after overriding the site veto', async () => {
    const contents = new Contents();
    contents.blocks = true;
    expect(await requestPageClose(contents, () => true)).toBe(true);
  });
  it('keeps a hung page open by default and offers explicit force close', async () => {
    vi.useFakeTimers();
    const contents = new Contents();
    contents.hangs = true;
    const decide = vi.fn(() => false);
    const pending = requestPageClose(contents, decide, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toBe(false);
    expect(contents.destroyed).toBe(false);
    expect(decide).toHaveBeenCalledWith('unresponsive');
    const force = requestPageClose(contents, () => true, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await force).toBe(true);
  });
});
