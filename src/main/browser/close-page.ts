/** The narrow native lifecycle seam, kept testable without launching Electron. */
export interface ClosableContents {
  isDestroyed(): boolean;
  close(options: { waitForBeforeUnload: boolean }): void;
  on(event: 'destroyed', listener: () => void): unknown;
  on(
    event: 'will-prevent-unload',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  off(event: 'destroyed', listener: () => void): unknown;
  off(
    event: 'will-prevent-unload',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
}

/** Close only after Chromium runs the site's beforeunload handlers. */
export function requestPageClose(
  contents: ClosableContents,
  decide: (reason: 'unsaved' | 'unresponsive') => boolean,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (contents.isDestroyed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      contents.off('destroyed', destroyed);
      contents.off('will-prevent-unload', prevented);
      resolve(allowed);
    };
    const destroyed = () => finish(true);
    const prevented = (event: { preventDefault(): void }) => {
      // In Electron, preventDefault overrides the page's veto and permits leaving.
      if (decide('unsaved')) event.preventDefault();
      else finish(false);
    };
    const timer = setTimeout(() => {
      if (!decide('unresponsive')) return finish(false);
      contents.close({ waitForBeforeUnload: false });
    }, timeoutMs);
    contents.on('destroyed', destroyed);
    contents.on('will-prevent-unload', prevented);
    try {
      contents.close({ waitForBeforeUnload: true });
    } catch {
      finish(contents.isDestroyed());
    }
  });
}
