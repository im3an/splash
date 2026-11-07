import {
  liveLimit,
  parsePressureLevel,
  watchMemoryPressure,
  type MemoryPressure,
} from './memory-pressure';

describe('liveLimit', () => {
  it('leaves the setting alone while memory is fine', () => {
    expect(liveLimit(12, 'normal')).toBe(12);
    expect(liveLimit(100, 'normal')).toBe(100);
  });

  it('halves it under pressure, keeping a page to go back to', () => {
    expect(liveLimit(12, 'warn')).toBe(6);
    expect(liveLimit(5, 'warn')).toBe(3);
    expect(liveLimit(2, 'warn')).toBe(2);
  });

  it('keeps only two when memory is critical', () => {
    expect(liveLimit(12, 'critical')).toBe(2);
    expect(liveLimit(1, 'critical')).toBe(1);
  });
});

describe('parsePressureLevel', () => {
  it('reads the levels macOS reports', () => {
    expect(parsePressureLevel('1\n')).toBe('normal');
    expect(parsePressureLevel('2\n')).toBe('warn');
    expect(parsePressureLevel('4\n')).toBe('critical');
  });

  it('takes anything else as no answer', () => {
    expect(parsePressureLevel('')).toBeNull();
    expect(parsePressureLevel('3')).toBeNull();
    expect(parsePressureLevel('unknown oid')).toBeNull();
  });
});

describe('watchMemoryPressure', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function watch(readings: (MemoryPressure | null)[]) {
    const changes: MemoryPressure[] = [];
    const stop = watchMemoryPressure((level) => changes.push(level), {
      read: async () => readings.shift() ?? null,
      intervalMs: 100,
    });
    const tick = async (count: number) => {
      for (let i = 0; i < count; i++) await vi.advanceTimersByTimeAsync(100);
    };
    await tick(0);
    return { changes, stop, tick };
  }

  it('says nothing while memory stays fine', async () => {
    const { changes, tick } = await watch(['normal', 'normal']);
    await tick(1);
    expect(changes).toEqual([]);
  });

  it('reports each change once, including the recovery', async () => {
    const { changes, tick } = await watch([
      'normal',
      'warn',
      'warn',
      'critical',
      'normal',
    ]);
    await tick(4);
    expect(changes).toEqual(['warn', 'critical', 'normal']);
  });

  it('keeps the last level when a reading fails', async () => {
    const { changes, tick } = await watch(['warn', null, 'warn']);
    await tick(2);
    expect(changes).toEqual(['warn']);
  });

  it('stops', async () => {
    const { changes, stop, tick } = await watch(['normal', 'warn']);
    stop();
    await tick(2);
    expect(changes).toEqual([]);
  });
});
