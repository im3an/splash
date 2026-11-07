import { describe, expect, it } from 'vitest';
import { LogRing, buildReport, redact, type ReportInput } from './diagnostics';

describe('redact', () => {
  it('keeps only the site of each address', () => {
    expect(
      redact(
        'Failed https://mail.example.com/inbox?id=42#msg and http://a.test:8080/x',
        null,
      ),
    ).toBe('Failed https://mail.example.com/… and http://a.test:8080/…');
  });

  it('drops credentials, files, emails and the home folder', () => {
    expect(
      redact(
        'https://user:secret@site.example/p file:///Users/me/notes.txt me@example.org /Users/me/Library',
        '/Users/me',
      ),
    ).toBe('https://site.example/… file://… <email> ~/Library');
  });
});

describe('LogRing', () => {
  it('keeps the latest entries', () => {
    const ring = new LogRing(2);
    for (const text of ['a', 'b', 'c']) {
      ring.add({ time: 0, level: 'warn', text });
    }
    expect(ring.list().map((entry) => entry.text)).toEqual(['b', 'c']);
  });
});

describe('buildReport', () => {
  const input: ReportInput = {
    now: Date.UTC(2026, 10, 7, 12),
    app: { version: '0.9.0', packaged: true },
    versions: { electron: '45.2.3', chromium: '142.0', node: '22.0' },
    system: {
      macOS: '27.0',
      arch: 'arm64',
      model: 'Mac16,1',
      memoryGb: 16,
      cpus: 10,
      locale: 'de-DE',
    },
    uptimeSeconds: 3720,
    processes: [
      { type: 'Browser', memoryMb: 300 },
      { type: 'Tab', memoryMb: 100 },
      { type: 'Tab', memoryMb: 50.4 },
    ],
    extensions: [{ name: 'uBlock Origin', version: '1.75.0', enabled: true }],
    crashes: [
      { name: 'old.dmp', time: Date.UTC(2026, 10, 1) },
      { name: 'new.dmp', time: Date.UTC(2026, 10, 6) },
    ],
    log: [
      {
        time: Date.UTC(2026, 10, 7, 11),
        level: 'error',
        text: 'Load failed for https://bank.example/account/123',
      },
    ],
    home: '/Users/me',
  };

  it('says what it is, sums processes and lists the newest crash first', () => {
    const report = buildReport(input);
    expect(report).toContain('Version: 0.9.0\n');
    expect(report).toContain('Running for: 1 h 2 min');
    expect(report).toContain('Tab: 2, 150 MB');
    expect(report.indexOf('new.dmp')).toBeLessThan(report.indexOf('old.dmp'));
    expect(report).toContain('uBlock Origin 1.75.0');
  });

  it('never includes a full address', () => {
    const report = buildReport(input);
    expect(report).toContain('https://bank.example/…');
    expect(report).not.toContain('account/123');
  });

  it('marks a development build and empty sections', () => {
    const report = buildReport({
      ...input,
      app: { version: '0.9.0', packaged: false },
      extensions: [],
      crashes: [],
      log: [],
    });
    expect(report).toContain('0.9.0 (development build)');
    expect(report).toContain('## Extensions\nNone');
    expect(report).toContain('None since Splash started');
  });
});
