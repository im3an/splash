import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import SafeZip, { entryPath } from './safe-zip';

describe('entryPath', () => {
  const root = '/data/Extensions/abc';

  it('keeps ordinary entries under the folder', () => {
    expect(entryPath(root, 'manifest.json')).toBe(`${root}/manifest.json`);
    expect(entryPath(root, 'js/a/b.js')).toBe(`${root}/js/a/b.js`);
    expect(entryPath(root, 'js/../b.js')).toBe(`${root}/b.js`);
  });

  it('refuses anything that would leave it', () => {
    for (const name of [
      '../evil.js',
      'js/../../evil.js',
      '/etc/passwd',
      '..\\evil.js',
      'a\0b',
      '../abc-sibling/evil.js',
      '.',
    ]) {
      expect(entryPath(root, name)).toBeNull();
    }
  });
});

describe('SafeZip', () => {
  let root: string;
  let destination: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'safe-zip-'));
    destination = path.join(root, 'out');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('unpacks files, nested folders and binary contents', () => {
    const bytes = new Uint8Array([0, 255, 1, 254]);
    new SafeZip(
      zipSync({
        'manifest.json': strToU8('{"version":"1"}'),
        'js/deep/a.js': strToU8('run()'),
        'icon.png': bytes,
      }),
    ).extractAllTo(destination, true);
    expect(readFileSync(path.join(destination, 'manifest.json'), 'utf8')).toBe(
      '{"version":"1"}',
    );
    expect(readFileSync(path.join(destination, 'js/deep/a.js'), 'utf8')).toBe(
      'run()',
    );
    expect([...readFileSync(path.join(destination, 'icon.png'))]).toEqual([
      ...bytes,
    ]);
  });

  it('writes nothing at all when one entry tries to escape', () => {
    const archive = zipSync({
      'manifest.json': strToU8('{}'),
      '../escaped.js': strToU8('evil()'),
    });
    expect(() => new SafeZip(archive).extractAllTo(destination)).toThrow(
      /bad path/,
    );
    expect(existsSync(path.join(root, 'escaped.js'))).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  it('writes plain files, without the archive’s permissions', () => {
    // 0o104755: a setuid executable, as a Unix zip tool would record it.
    const archive = zipSync({
      'run.sh': [
        strToU8('#!/bin/sh'),
        { os: 3, attrs: (0o104755 << 16) >>> 0 },
      ],
    });
    new SafeZip(archive).extractAllTo(destination);
    const file = path.join(destination, 'run.sh');
    expect(lstatSync(file).isFile()).toBe(true);
    expect(statSync(file).mode & 0o6111).toBe(0);
  });

  it('turns a symlink entry into a harmless text file', () => {
    // 0o120777 is how a zip marks a symlink; its contents are the target.
    const archive = zipSync({
      link: [strToU8('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }],
    });
    new SafeZip(archive).extractAllTo(destination);
    const link = path.join(destination, 'link');
    expect(lstatSync(link).isSymbolicLink()).toBe(false);
    expect(readFileSync(link, 'utf8')).toBe('/etc/passwd');
  });

  it('refuses an archive that isn’t one', () => {
    expect(() =>
      new SafeZip(strToU8('not a zip')).extractAllTo(destination),
    ).toThrow();
  });
});
