import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * Electron saves downloads without macOS's quarantine flag, so Gatekeeper
 * would never check an app downloaded here before its first launch. Splash
 * adds the flag itself, as Chrome and Safari do.
 */
export const QUARANTINE_ATTRIBUTE = 'com.apple.quarantine';

/**
 * The flag's value: downloaded from the web, by an app outside a sandbox, and
 * not yet approved by the user. That last part is what makes Gatekeeper ask.
 */
export function quarantineValue(
  now: number,
  agent = 'Splash',
  id: string = randomUUID(),
): string {
  const seconds = Math.floor(now / 1000).toString(16);
  return `0081;${seconds};${agent};${id.toUpperCase()}`;
}

export type RunFile = (
  file: string,
  args: string[],
  done: (error: Error | null) => void,
) => void;

const runXattr: RunFile = (file, args, done) => {
  execFile(file, args, (error) => done(error));
};

/** Marks a finished download as from the internet. Only macOS has the flag. */
export function quarantineDownload(
  path: string,
  {
    now = Date.now(),
    platform = process.platform,
    run = runXattr,
  }: { now?: number; platform?: NodeJS.Platform; run?: RunFile } = {},
): Promise<void> {
  if (platform !== 'darwin') return Promise.resolve();
  return new Promise((resolve) => {
    run(
      '/usr/bin/xattr',
      ['-w', QUARANTINE_ATTRIBUTE, quarantineValue(now), path],
      (error) => {
        if (error) console.warn(`Could not mark ${path} as downloaded`, error);
        resolve();
      },
    );
  });
}
