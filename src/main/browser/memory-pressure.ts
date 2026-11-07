import { execFile } from 'node:child_process';

export type MemoryPressure = 'normal' | 'warn' | 'critical';

/** Often enough to act before macOS starts to swap hard; a sysctl costs little. */
const CHECK_EVERY_MS = 30_000;

/**
 * How many pages stay awake right now. The user's setting is the ceiling, and
 * pressure lowers it only until it passes. Pages on screen, playing sound or on
 * a call are never put to sleep, so they can take it over.
 */
export function liveLimit(setting: number, pressure: MemoryPressure): number {
  switch (pressure) {
    case 'normal':
      return setting;
    case 'warn':
      return Math.max(2, Math.ceil(setting / 2));
    case 'critical':
      return Math.min(setting, 2);
  }
}

/** What `kern.memorystatus_vm_pressure_level` says: 1, 2 or 4. */
export function parsePressureLevel(output: string): MemoryPressure | null {
  switch (output.trim()) {
    case '1':
      return 'normal';
    case '2':
      return 'warn';
    case '4':
      return 'critical';
    default:
      return null;
  }
}

function readPressure(): Promise<MemoryPressure | null> {
  return new Promise((resolve) => {
    execFile(
      '/usr/sbin/sysctl',
      ['-n', 'kern.memorystatus_vm_pressure_level'],
      (error, stdout) => resolve(error ? null : parsePressureLevel(stdout)),
    );
  });
}

/**
 * Reports each change in the Mac's memory pressure. It only ever reads, and a
 * reading that fails changes nothing. Returns a function that stops it.
 */
export function watchMemoryPressure(
  onChange: (pressure: MemoryPressure) => void,
  {
    read = readPressure,
    intervalMs = CHECK_EVERY_MS,
  }: {
    read?: () => Promise<MemoryPressure | null>;
    intervalMs?: number;
  } = {},
): () => void {
  let current: MemoryPressure = 'normal';
  let stopped = false;
  const check = async () => {
    const next = await read();
    if (stopped || next === null || next === current) return;
    current = next;
    onChange(next);
  };
  void check();
  const timer = setInterval(() => void check(), intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
