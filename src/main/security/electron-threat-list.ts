import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, net } from 'electron';
import type { PreferencesService } from '../preferences';
import { CHECK_EVERY_MS, ThreatList } from './threat-list';

/** malware-filter's lists, built from OpenPhish, PhishTank and URLhaus. */
const SOURCES = [
  'phishing-filter-domains.txt',
  'urlhaus-filter-domains-online.txt',
];
const MIRRORS = [
  'https://malware-filter.gitlab.io/malware-filter/',
  'https://malware-filter.pages.dev/',
];
const CACHE_FILE = 'threat-lists.txt';

async function fetchSource(name: string): Promise<string> {
  let failure: unknown;
  for (const mirror of MIRRORS) {
    try {
      const response = await net.fetch(`${mirror}${name}`);
      if (response.ok) return await response.text();
      failure = new Error(`${response.status} for ${name}`);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export function createThreatList(preferences: PreferencesService): ThreatList {
  const cacheFile = path.join(app.getPath('userData'), CACHE_FILE);
  const threats = new ThreatList({
    download: () => Promise.all(SOURCES.map(fetchSource)),
    readCache: async () => {
      try {
        const [text, info] = await Promise.all([
          readFile(cacheFile, 'utf8'),
          stat(cacheFile),
        ]);
        return { text, savedAt: info.mtimeMs };
      } catch {
        return null;
      }
    },
    writeCache: (text) => writeFile(cacheFile, text),
    enabled: () => preferences.get().warnDangerousSites,
    now: Date.now,
  });
  const refresh = () => void threats.refresh();
  refresh();
  setInterval(refresh, CHECK_EVERY_MS);
  // Off means no downloads at all, so turning it on has to start them.
  preferences.onChange(refresh);
  return threats;
}
