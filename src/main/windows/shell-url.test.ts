import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

const { isSameDocument, shellFile } = await import('./shell-url');

const ROOT = path.resolve('/app/renderer/main_window');

describe('shellFile', () => {
  it('maps app://splash/ to files in the bundle', () => {
    expect(shellFile(ROOT, 'app://splash/index.html')).toBe(
      path.join(ROOT, 'index.html'),
    );
    expect(shellFile(ROOT, 'app://splash/assets/a%20b.js?v=1#x')).toBe(
      path.join(ROOT, 'assets/a b.js'),
    );
  });

  it.each([
    'app://splash/../../secret.txt',
    'app://splash/%2e%2e/%2e%2e/secret.txt',
  ])('keeps %s inside the bundle', (url) =>
    expect(shellFile(ROOT, url)).toBe(path.join(ROOT, 'secret.txt')),
  );

  it.each([
    'app://splash/..%2f..%2fsecret.txt',
    'app://other/index.html',
    'file:///app/renderer/main_window/index.html',
    'app://splash/%E0%A4%A',
    'not a url',
  ])('refuses %s', (url) => expect(shellFile(ROOT, url)).toBeNull());
});

describe('isSameDocument', () => {
  const SHELL = 'app://splash/index.html';

  it('matches the shell document with any hash', () => {
    expect(isSameDocument('app://splash/index.html#settings', SHELL)).toBe(
      true,
    );
  });

  it('does not treat other opaque origins as the shell', () => {
    expect(isSameDocument('crx://splash/index.html', SHELL)).toBe(false);
    expect(isSameDocument('app://evil/index.html', SHELL)).toBe(false);
    expect(isSameDocument('app://splash/other.html', SHELL)).toBe(false);
  });

  it('compares origins for the dev server', () => {
    const dev = 'http://localhost:5173/';
    expect(isSameDocument('http://localhost:5173/#settings', dev)).toBe(true);
    expect(isSameDocument('http://localhost:5174/', dev)).toBe(false);
  });
});
