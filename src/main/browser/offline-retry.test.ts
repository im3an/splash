import { sampleSnapshot } from '../../renderer/test-fixtures';
import { OfflineRetry } from './offline-retry';

const offline = {
  error: {
    kind: 'load-failed' as const,
    code: -106,
    description: 'ERR_INTERNET_DISCONNECTED',
    url: 'https://b.example/',
  },
};

function setup(online: { value: boolean }) {
  const retried: string[] = [];
  let tick: (() => void) | null = null;
  const retry = new OfflineRetry({
    isOnline: () => online.value,
    retry: (id) => retried.push(id),
    setInterval: (run) => {
      tick = run;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  return { retry, retried, tick: () => tick?.(), polling: () => tick !== null };
}

describe('OfflineRetry', () => {
  it('retries offline pages once the connection comes back', () => {
    const online = { value: false };
    const { retry, retried, tick, polling } = setup(online);
    retry.update(sampleSnapshot({ b: offline }));
    tick();
    expect(retried).toEqual([]);
    online.value = true;
    tick();
    expect(retried).toEqual(['b']);
    expect(polling()).toBe(false);
  });

  it('does not loop when a page fails offline while the Mac is online', () => {
    const online = { value: true };
    const { retry, retried, tick } = setup(online);
    retry.update(sampleSnapshot({ b: offline }));
    tick();
    tick();
    expect(retried).toEqual([]);
  });

  it('stops polling when no page is offline any more', () => {
    const { retry, polling } = setup({ value: false });
    retry.update(sampleSnapshot({ b: offline }));
    expect(polling()).toBe(true);
    retry.update(sampleSnapshot());
    expect(polling()).toBe(false);
  });

  it('ignores other load failures', () => {
    const { retry, polling } = setup({ value: false });
    retry.update(
      sampleSnapshot({ b: { error: { ...offline.error, code: -105 } } }),
    );
    expect(polling()).toBe(false);
  });
});
