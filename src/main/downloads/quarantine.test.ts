import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  QUARANTINE_ATTRIBUTE,
  quarantineDownload,
  quarantineValue,
} from './quarantine';

describe('quarantine', () => {
  it('says downloaded, by Splash, and not yet approved', () => {
    const value = quarantineValue(Date.UTC(2026, 10, 9), 'Splash', 'abc-123');
    const [flags, seconds, agent, id] = value.split(';');
    expect(flags).toBe('0081');
    // 0x40 would mean the user already approved it, and skip Gatekeeper.
    expect(Number.parseInt(flags!, 16) & 0x40).toBe(0);
    expect(Number.parseInt(seconds!, 16)).toBe(Date.UTC(2026, 10, 9) / 1000);
    expect(agent).toBe('Splash');
    expect(id).toBe('ABC-123');
  });

  it('does nothing away from macOS', async () => {
    const run = vi.fn();
    await quarantineDownload('/tmp/a.dmg', { platform: 'linux', run });
    expect(run).not.toHaveBeenCalled();
  });

  it('settles even when the flag cannot be written', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await quarantineDownload('/gone.dmg', {
      platform: 'darwin',
      run: (_file, _args, done) => done(new Error('No such file')),
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it.runIf(process.platform === 'darwin')(
    'leaves the flag on a real file',
    async () => {
      const folder = mkdtempSync(path.join(tmpdir(), 'splash-quarantine-'));
      try {
        const file = path.join(folder, 'Installer.dmg');
        writeFileSync(file, 'not really a disk image');
        await quarantineDownload(file);
        const value = execFileSync(
          '/usr/bin/xattr',
          ['-p', QUARANTINE_ATTRIBUTE, file],
          { encoding: 'utf8' },
        ).trim();
        expect(value).toMatch(/^0081;[0-9a-f]+;Splash;[0-9A-F-]{36}$/);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
