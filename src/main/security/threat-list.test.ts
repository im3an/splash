import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dangerousSiteKey,
  isHostListed,
  parseThreatList,
  REFRESH_AFTER_MS,
  ThreatList,
} from './threat-list';

/** Enough hosts to pass as a real list. */
const LIST = [
  '# Title: test',
  'evil.example',
  ...Array.from({ length: 120 }, (_, index) => `bad${index}.example`),
].join('\n');

describe('parseThreatList', () => {
  it('keeps hosts and skips comments, blanks and junk', () => {
    expect(
      parseThreatList(
        '# comment\n\nEVIL.example\n1.2.3.4\n<html>\nlocalhost\nnot a host\n',
      ),
    ).toEqual(['evil.example', '1.2.3.4']);
  });
});

describe('isHostListed', () => {
  const listed = new Set(['evil.example', 'phish.weebly.com', '1.2.3.4']);

  it('matches the host and what is under it', () => {
    expect(isHostListed(listed, 'evil.example')).toBe(true);
    expect(isHostListed(listed, 'Login.Evil.Example')).toBe(true);
    expect(isHostListed(listed, 'a.b.phish.weebly.com')).toBe(true);
  });

  it('does not match its neighbours or parents', () => {
    expect(isHostListed(listed, 'weebly.com')).toBe(false);
    expect(isHostListed(listed, 'other.weebly.com')).toBe(false);
    expect(isHostListed(listed, 'notevil.example')).toBe(false);
  });

  it('matches addresses exactly', () => {
    expect(isHostListed(listed, '1.2.3.4')).toBe(true);
    expect(isHostListed(listed, '1.2.3.45')).toBe(false);
  });
});

describe('dangerousSiteKey', () => {
  it('is the same for HTTP, HTTPS and any port or path', () => {
    expect(dangerousSiteKey('http://evil.example:8080/login')).toBe(
      'https://evil.example',
    );
    expect(dangerousSiteKey('https://evil.example/')).toBe(
      'https://evil.example',
    );
  });

  it('is nothing for what is not a web address', () => {
    expect(dangerousSiteKey('file:///etc/passwd')).toBeNull();
    expect(dangerousSiteKey('nonsense')).toBeNull();
  });
});

describe('ThreatList', () => {
  let now: number;
  let enabled: boolean;
  let saved: { text: string; savedAt: number } | null;
  const download = vi.fn<() => Promise<string[]>>();
  const make = () =>
    new ThreatList({
      download,
      readCache: async () => saved,
      writeCache: async (text) => {
        saved = { text, savedAt: now };
      },
      enabled: () => enabled,
      now: () => now,
    });

  beforeEach(() => {
    now = 1_000_000_000;
    enabled = true;
    saved = null;
    download.mockReset();
    download.mockResolvedValue([LIST]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('downloads, then answers and saves', async () => {
    const threats = make();
    expect(threats.getStatus().state).toBe('loading');
    await threats.refresh();
    expect(threats.isListed('evil.example')).toBe(true);
    expect(threats.getStatus()).toMatchObject({ state: 'ready', count: 121 });
    expect(saved?.text).toContain('evil.example');
  });

  it('uses fresh saved lists without downloading', async () => {
    saved = { text: 'evil.example', savedAt: now - 1000 };
    const threats = make();
    await threats.refresh();
    expect(download).not.toHaveBeenCalled();
    expect(threats.isListed('evil.example')).toBe(true);
  });

  it('downloads again once the lists are due', async () => {
    const threats = make();
    await threats.refresh();
    now += REFRESH_AFTER_MS - 1;
    await threats.refresh();
    expect(download).toHaveBeenCalledOnce();
    now += 1;
    await threats.refresh();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('says so when the first download fails, and tries again', async () => {
    download.mockRejectedValueOnce(new Error('offline'));
    const threats = make();
    await threats.refresh();
    expect(threats.getStatus().state).toBe('failed');
    await threats.refresh();
    expect(threats.getStatus().state).toBe('ready');
  });

  it('keeps what it has when a newer download fails', async () => {
    const threats = make();
    await threats.refresh();
    now += REFRESH_AFTER_MS;
    download.mockRejectedValueOnce(new Error('offline'));
    await threats.refresh();
    expect(threats.isListed('evil.example')).toBe(true);
    expect(threats.getStatus()).toMatchObject({
      state: 'ready',
      updateFailed: true,
    });
  });

  it('refuses a list that came back nearly empty', async () => {
    const threats = make();
    await threats.refresh();
    now += REFRESH_AFTER_MS;
    download.mockResolvedValueOnce(['<html>maintenance</html>\nonly.example']);
    await threats.refresh();
    expect(threats.isListed('evil.example')).toBe(true);
    expect(threats.getStatus().updateFailed).toBe(true);
  });

  it('downloads nothing while turned off', async () => {
    enabled = false;
    const threats = make();
    await threats.refresh();
    expect(download).not.toHaveBeenCalled();
    expect(threats.getStatus().state).toBe('off');
  });
});
