import { EventEmitter } from 'node:events';
import type { Session } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiresValidHttps } from './strict-https';

const mock = vi.hoisted(() => ({
  url: '',
  answer: (_request: never) => undefined as void,
}));

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    net: {
      request: ({ url }: { url: string }) => {
        mock.url = url;
        const request = new Emitter() as EventEmitter & {
          end(): void;
          abort(): void;
        };
        request.end = () => mock.answer(request as never);
        request.abort = () => undefined;
        return request;
      },
    },
  };
});

const session = {} as Session;
const answerWith = (answer: (request: EventEmitter) => void) => {
  mock.answer = answer as never;
};

describe('requiresValidHttps', () => {
  beforeEach(() => vi.useRealTimers());

  it('asks on a port Chromium won’t connect to', async () => {
    answerWith((request) =>
      request.emit('error', new Error('net::ERR_UNSAFE_PORT')),
    );
    await expect(requiresValidHttps(session, 'nas.test')).resolves.toBe(false);
    expect(mock.url).toBe('http://nas.test:9/');
  });

  it('is strict when HSTS redirects it', async () => {
    answerWith((request) => request.emit('redirect', 307));
    await expect(requiresValidHttps(session, 'a.test')).resolves.toBe(true);
  });

  it.each([
    [
      'another error',
      (r: EventEmitter) => r.emit('error', new Error('net::ERR_FAILED')),
    ],
    ['an answer', (r: EventEmitter) => r.emit('response', {})],
  ])(
    'counts %s as strict, since it isn’t what it should see',
    async (_n, a) => {
      answerWith(a);
      await expect(requiresValidHttps(session, 'a.test')).resolves.toBe(true);
    },
  );

  it('counts silence as strict', async () => {
    vi.useFakeTimers();
    answerWith(() => undefined);
    const result = requiresValidHttps(session, 'a.test');
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toBe(true);
  });
});
