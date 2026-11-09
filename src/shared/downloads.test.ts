import { downloadCategory, popoverDownloads } from './downloads';
import type { DownloadState, DownloadSummary } from './types';

function download(id: string, state: DownloadState): DownloadSummary {
  return {
    id,
    pageId: null,
    url: `https://files.example/${id}`,
    filename: id,
    savePath: null,
    state,
    receivedBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    startedAt: 0,
    problem: null,
    runnable: false,
  };
}

describe('downloadCategory', () => {
  it.each([
    ['report.pdf', 'documents'],
    ['photo.JPEG', 'images'],
    ['clip.mov', 'video'],
    ['song.flac', 'audio'],
    ['backup.tar.gz', 'archives'],
    ['Installer.dmg', 'apps'],
    ['font.woff2', 'other'],
    ['README', 'other'],
    ['.bashrc', 'other'],
    ['trailing.', 'other'],
  ])('sorts %s into %s', (filename, category) => {
    expect(downloadCategory({ filename, runnable: false })).toBe(category);
  });

  it('counts anything that can run code as an app, whatever its name', () => {
    expect(downloadCategory({ filename: 'setup.sh', runnable: true })).toBe(
      'apps',
    );
  });
});

describe('popoverDownloads', () => {
  it('puts running and paused downloads ahead of newer finished ones', () => {
    const list = [
      download('done', 'completed'),
      download('running', 'progressing'),
      download('failed', 'interrupted'),
      download('paused', 'paused'),
    ];
    expect(popoverDownloads(list).map((d) => d.id)).toEqual([
      'running',
      'paused',
      'done',
      'failed',
    ]);
  });

  it('fills up to the limit with the latest finished ones', () => {
    const list = [
      download('a', 'completed'),
      download('b', 'progressing'),
      download('c', 'completed'),
      download('d', 'completed'),
    ];
    expect(popoverDownloads(list, 3).map((d) => d.id)).toEqual(['b', 'a', 'c']);
  });

  it('never hides something still running, even past the limit', () => {
    const list = [
      download('a', 'progressing'),
      download('b', 'progressing'),
      download('c', 'paused'),
      download('d', 'completed'),
    ];
    expect(popoverDownloads(list, 2).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });
});
