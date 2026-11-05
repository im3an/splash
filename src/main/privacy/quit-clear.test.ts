import { describe, expect, it, vi } from 'vitest';
import type { ClearOnQuit } from '../../shared/preferences';
import { QuitClear } from './quit-clear';

const NOTHING: ClearOnQuit = {
  history: false,
  cookies: false,
  cache: false,
  downloads: false,
};

function setup(
  chosen: Partial<ClearOnQuit>,
  clear = vi.fn(async () => undefined as unknown),
) {
  const saved = new Map<string, string>();
  const quitClear = new QuitClear({
    store: {
      getPreference: (key) => saved.get(key) ?? null,
      setPreference: (key, value) => void saved.set(key, value),
    },
    chosen: () => ({ ...NOTHING, ...chosen }),
    clear,
    timeoutMs: 10,
  });
  return { quitClear, clear };
}

describe('QuitClear', () => {
  it('clears only what was chosen, for all time, on quit', async () => {
    const { quitClear, clear } = setup({ cookies: true });
    await quitClear.atLaunch();
    expect(clear).not.toHaveBeenCalled();
    await quitClear.atQuit();
    expect(clear).toHaveBeenCalledExactlyOnceWith({
      ...NOTHING,
      cookies: true,
      range: 'all',
      permissions: false,
    });
  });

  it('does nothing when nothing was chosen', async () => {
    const { quitClear, clear } = setup({});
    await quitClear.atLaunch();
    await quitClear.atQuit();
    expect(clear).not.toHaveBeenCalled();
  });

  it('finishes at the next launch after a crash', async () => {
    const { quitClear, clear } = setup({ history: true });
    await quitClear.atLaunch();
    // The app crashed here: no atQuit.
    await quitClear.atLaunch();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('does not clear again at launch after a clean quit', async () => {
    const { quitClear, clear } = setup({ history: true });
    await quitClear.atLaunch();
    await quitClear.atQuit();
    await quitClear.atLaunch();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('never holds up quitting, and retries at launch', async () => {
    const stuck = vi.fn(() => new Promise<unknown>(() => undefined));
    const { quitClear } = setup({ cache: true }, stuck);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await quitClear.atLaunch();
    await quitClear.atQuit();
    await quitClear.atLaunch().catch(() => undefined);
    expect(stuck).toHaveBeenCalledTimes(2);
  });
});
