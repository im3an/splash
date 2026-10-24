import { SessionPersister } from './session-persister';
import type { StoredSession, TrailStore } from './trail-store';

const EMPTY: StoredSession = {
  workspaces: [],
  pages: [],
  activeWorkspaceId: null,
};

function setup(saveSession = vi.fn()) {
  const store = { saveSession } as unknown as TrailStore;
  const exportSession = vi.fn(() => EMPTY);
  const onError = vi.fn();
  const persister = new SessionPersister({
    store,
    exportSession,
    delayMs: 100,
    intervalMs: 10_000,
    onError,
  });
  return { persister, saveSession, exportSession, onError };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SessionPersister', () => {
  it('writes once after changes settle', () => {
    const { persister, saveSession } = setup();
    persister.schedule();
    vi.advanceTimersByTime(50);
    persister.schedule();
    vi.advanceTimersByTime(99);
    expect(saveSession).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(saveSession).toHaveBeenCalledTimes(1);
    persister.dispose();
  });

  it('flushes immediately and only when something changed', () => {
    const { persister, saveSession } = setup();
    persister.flush();
    expect(saveSession).not.toHaveBeenCalled();
    persister.schedule();
    persister.flush();
    expect(saveSession).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(saveSession).toHaveBeenCalledTimes(1);
    persister.dispose();
  });

  it('saves periodically to keep page state fresh', () => {
    const { persister, saveSession } = setup();
    vi.advanceTimersByTime(10_000);
    expect(saveSession).toHaveBeenCalledTimes(1);
    persister.dispose();
  });

  it('reports failures and retries on the next flush', () => {
    const saveSession = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('disk full');
      })
      .mockImplementation(() => undefined);
    const { persister, onError } = setup(saveSession);
    persister.schedule();
    persister.flush();
    expect(onError).toHaveBeenCalledOnce();
    persister.flush();
    expect(saveSession).toHaveBeenCalledTimes(2);
    persister.dispose();
  });
});
