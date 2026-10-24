import path from 'node:path';
import { isRunnableFile, safeFileName, uniqueFilePath } from './download-files';

describe('download files', () => {
  it('numbers copies the way Finder does', () => {
    const taken = new Set(['/d/report.pdf', '/d/report 2.pdf']);
    expect(uniqueFilePath('/d', 'report.pdf', (p) => taken.has(p))).toBe(
      path.join('/d', 'report 3.pdf'),
    );
    expect(uniqueFilePath('/d', 'notes', () => false)).toBe('/d/notes');
  });

  it('never lets a name escape the folder', () => {
    expect(safeFileName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(safeFileName('...')).toBe('download');
    expect(safeFileName('a:b\u0007c')).toBe('a-b-c');
  });

  it('flags files that can run code', () => {
    expect(isRunnableFile('Installer.PKG')).toBe(true);
    expect(isRunnableFile('script.command')).toBe(true);
    expect(isRunnableFile('photo.jpg')).toBe(false);
    expect(isRunnableFile('Archive.zip')).toBe(false);
  });
});
