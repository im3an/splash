import type { DownloadSummary } from './types';

export type DownloadCategory =
  | 'documents'
  | 'images'
  | 'video'
  | 'audio'
  | 'archives'
  | 'apps'
  | 'other';

/** Every category, in the order they're offered. */
export const DOWNLOAD_CATEGORIES: readonly DownloadCategory[] = [
  'documents',
  'images',
  'video',
  'audio',
  'archives',
  'apps',
  'other',
];

export const downloadCategoryLabels: Record<DownloadCategory, string> = {
  documents: 'Documents',
  images: 'Images',
  video: 'Video',
  audio: 'Audio',
  archives: 'Archives',
  apps: 'Apps',
  other: 'Other',
};

const EXTENSIONS: Record<Exclude<DownloadCategory, 'other'>, string[]> = {
  documents: [
    'pdf',
    'doc',
    'docx',
    'odt',
    'rtf',
    'txt',
    'md',
    'pages',
    'key',
    'numbers',
    'xls',
    'xlsx',
    'ods',
    'csv',
    'tsv',
    'ppt',
    'pptx',
    'odp',
    'epub',
    'mobi',
    'tex',
    'json',
    'xml',
    'html',
    'htm',
    'mhtml',
    'webarchive',
  ],
  images: [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'avif',
    'heic',
    'heif',
    'svg',
    'bmp',
    'tif',
    'tiff',
    'ico',
    'raw',
    'cr2',
    'nef',
    'arw',
    'dng',
    'psd',
    'ai',
    'sketch',
    'fig',
  ],
  video: [
    'mp4',
    'm4v',
    'mov',
    'avi',
    'mkv',
    'webm',
    'wmv',
    'flv',
    'mpg',
    'mpeg',
    '3gp',
  ],
  audio: [
    'mp3',
    'm4a',
    'aac',
    'flac',
    'wav',
    'ogg',
    'oga',
    'opus',
    'aiff',
    'aif',
    'wma',
    'mid',
    'midi',
  ],
  archives: [
    'zip',
    'rar',
    '7z',
    'tar',
    'gz',
    'tgz',
    'bz2',
    'xz',
    'zst',
    'lz',
    'lzma',
    'cab',
    'sit',
    'iso',
  ],
  apps: ['dmg', 'app', 'pkg', 'mpkg', 'apk', 'deb', 'rpm', 'appimage', 'crx'],
};

const CATEGORY_OF_EXTENSION = new Map<string, DownloadCategory>(
  (Object.entries(EXTENSIONS) as [DownloadCategory, string[]][]).flatMap(
    ([category, extensions]) =>
      extensions.map((extension) => [extension, category] as const),
  ),
);

/**
 * What kind of file a download is, from its name. Worked out on the fly
 * rather than saved, so older entries in the list get a category too.
 */
export function downloadCategory({
  filename,
  runnable,
}: Pick<DownloadSummary, 'filename' | 'runnable'>): DownloadCategory {
  if (runnable) return 'apps';
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'other';
  return (
    CATEGORY_OF_EXTENSION.get(filename.slice(dot + 1).toLowerCase()) ?? 'other'
  );
}

/** Still running, or waiting to be resumed. */
export function isActiveDownload({ state }: Pick<DownloadSummary, 'state'>) {
  return state === 'progressing' || state === 'paused';
}

/**
 * What the progress popover lists: everything still running, however many,
 * then the latest of the rest up to `limit`. Takes the list newest first.
 */
export function popoverDownloads(
  downloads: readonly DownloadSummary[],
  limit = 5,
): DownloadSummary[] {
  const active = downloads.filter(isActiveDownload);
  const rest = downloads.filter((download) => !isActiveDownload(download));
  return [...active, ...rest.slice(0, Math.max(0, limit - active.length))];
}
