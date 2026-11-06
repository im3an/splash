import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import type { ImportResult, ImportSource } from '../../shared/types';
import type { PreferencesService } from '../preferences';
import type { HistoryRow, TrailStore } from '../storage/trail-store';
import type { Vault } from '../vault/vault';
import { parseBookmarkHtml } from './bookmark-html';
import {
  countLinks,
  mergeBookmarks,
  withoutFolder,
  type BookmarkNode,
} from './bookmark-tree';
import {
  parseChromiumBookmarks,
  parseSafariBookmarks,
  parseSafariHistoryExport,
  readChromiumHistory,
  readFirefoxBookmarks,
  readFirefoxHistory,
  readSafariHistory,
} from './browser-formats';
import { parseLoginCsv } from './login-csv';
import { parseBinaryPlist } from './plist';

/** A file bigger than this isn't a browser's export of anyone's data. */
const MAX_FILE_BYTES = 256 * 1024 * 1024;

/** Folders under Application Support for browsers that store things like Chrome. */
const CHROMIUM_BROWSERS: readonly [name: string, folder: string][] = [
  ['Chrome', 'Google/Chrome'],
  ['Brave', 'BraveSoftware/Brave-Browser'],
  ['Edge', 'Microsoft Edge'],
  ['Arc', 'Arc/User Data'],
  ['Vivaldi', 'Vivaldi'],
  ['Chromium', 'Chromium'],
];

type Reader = {
  bookmarks(): Promise<BookmarkNode[]>;
  history(): Promise<HistoryRow[]>;
};

interface FoundSource {
  source: ImportSource;
  reader: Reader;
}

/** Reads a database another app may have open, from a copy of it. */
async function withDatabaseCopy<T>(
  scratch: string,
  file: string,
  read: (db: DatabaseSync) => T,
): Promise<T> {
  const folder = await mkdtemp(path.join(scratch, 'splash-import-'));
  try {
    const copy = path.join(folder, 'copy.db');
    await copyFile(file, copy);
    // Recent changes may still be in these, beside the main file.
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(file + suffix)) {
        await copyFile(file + suffix, copy + suffix).catch(() => undefined);
      }
    }
    const db = new DatabaseSync(copy);
    try {
      return read(db);
    } finally {
      db.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function isBlocked(error: unknown): boolean {
  const { code } = error as { code?: string };
  return code === 'EPERM' || code === 'EACCES';
}

function safeReaddir(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

/** A Chromium profile's folder names, with the names people gave them. */
function chromiumProfiles(root: string): { folder: string; name: string }[] {
  const named = new Map<string, string>();
  try {
    const state = JSON.parse(
      readFileSync(path.join(root, 'Local State'), 'utf8'),
    ) as { profile?: { info_cache?: Record<string, { name?: string }> } };
    for (const [folder, info] of Object.entries(
      state.profile?.info_cache ?? {},
    )) {
      if (info.name) named.set(folder, info.name);
    }
  } catch {
    // Without this file the folders' own names will do.
  }
  return safeReaddir(root)
    .filter(
      (folder) =>
        (folder === 'Default' || /^Profile \d+$/.test(folder)) &&
        (existsSync(path.join(root, folder, 'Bookmarks')) ||
          existsSync(path.join(root, folder, 'History'))),
    )
    .map((folder) => ({ folder, name: named.get(folder) ?? folder }));
}

export interface TransferOptions {
  home: string;
  scratch: string;
  store: Pick<TrailStore, 'importHistory' | 'forgetHistory'>;
  preferences: Pick<PreferencesService, 'get' | 'update'>;
  vault: Pick<Vault, 'available' | 'importLogins'>;
  createId(): string;
  /** Moves a file to the Trash. */
  trash(file: string): Promise<void>;
}

/** Brings bookmarks, history and logins in from other browsers. */
export class Transfer {
  private readonly undos = new Map<string, () => void>();
  /** Password exports just read, by token, for "Move to Trash". */
  private readonly csvFiles = new Map<string, string>();

  constructor(private readonly options: TransferOptions) {}

  private found(): FoundSource[] {
    const { home } = this.options;
    const support = path.join(home, 'Library', 'Application Support');
    const found: FoundSource[] = [];

    for (const [browser, folder] of CHROMIUM_BROWSERS) {
      const root = path.join(support, folder);
      for (const profile of chromiumProfiles(root)) {
        found.push(this.chromiumSource(browser, root, profile));
      }
    }
    const firefox = path.join(support, 'Firefox', 'Profiles');
    for (const profile of safeReaddir(firefox)) {
      const places = path.join(firefox, profile, 'places.sqlite');
      if (existsSync(places)) found.push(this.firefoxSource(profile, places));
    }
    found.push(...this.safariSource(path.join(home, 'Library', 'Safari')));
    return found;
  }

  private chromiumSource(
    browser: string,
    root: string,
    profile: { folder: string; name: string },
  ): FoundSource {
    const { scratch } = this.options;
    const bookmarksFile = path.join(root, profile.folder, 'Bookmarks');
    const historyFile = path.join(root, profile.folder, 'History');
    return {
      source: {
        id: `chromium:${browser}:${profile.folder}`,
        browser,
        profile: profile.name,
        hasBookmarks: existsSync(bookmarksFile),
        hasHistory: existsSync(historyFile),
        blocked: false,
      },
      reader: {
        bookmarks: async () =>
          existsSync(bookmarksFile)
            ? parseChromiumBookmarks(readFileSync(bookmarksFile, 'utf8'))
            : [],
        history: async () =>
          existsSync(historyFile)
            ? withDatabaseCopy(scratch, historyFile, readChromiumHistory)
            : [],
      },
    };
  }

  private firefoxSource(profile: string, places: string): FoundSource {
    const { scratch } = this.options;
    return {
      source: {
        id: `firefox:${profile}`,
        browser: 'Firefox',
        // Folders look like "abc123.default-release".
        profile: profile.replace(/^[^.]*\./, ''),
        hasBookmarks: true,
        hasHistory: true,
        blocked: false,
      },
      reader: {
        bookmarks: () =>
          withDatabaseCopy(scratch, places, readFirefoxBookmarks),
        history: () => withDatabaseCopy(scratch, places, readFirefoxHistory),
      },
    };
  }

  private safariSource(folder: string): FoundSource[] {
    const { scratch } = this.options;
    const bookmarks = path.join(folder, 'Bookmarks.plist');
    const history = path.join(folder, 'History.db');
    // macOS only lets an app in here with Full Disk Access, which most people
    // rightly don't give a browser; Safari's own export works without it.
    let blocked = false;
    try {
      readdirSync(folder);
    } catch (error) {
      if (!isBlocked(error)) return [];
      blocked = true;
    }
    return [
      {
        source: {
          id: 'safari',
          browser: 'Safari',
          profile: null,
          hasBookmarks: blocked || existsSync(bookmarks),
          hasHistory: blocked || existsSync(history),
          blocked,
        },
        reader: {
          bookmarks: async () =>
            parseSafariBookmarks(parseBinaryPlist(readFileSync(bookmarks))),
          history: () => withDatabaseCopy(scratch, history, readSafariHistory),
        },
      },
    ];
  }

  /** The browsers on this Mac that have something to bring over. */
  sources(): ImportSource[] {
    return this.found().map(({ source }) => source);
  }

  async importFrom(
    id: string,
    what: { bookmarks: boolean; history: boolean },
  ): Promise<ImportResult> {
    const found = this.found().find(({ source }) => source.id === id);
    if (!found) throw new Error('That browser’s data is no longer there.');
    const { source, reader } = found;
    const name = source.profile
      ? `${source.browser} (${source.profile})`
      : source.browser;
    try {
      return this.apply(`Imported from ${name}`, {
        bookmarks: what.bookmarks ? await reader.bookmarks() : null,
        history: what.history ? await reader.history() : null,
      });
    } catch (error) {
      if (isBlocked(error)) {
        return {
          summary: `macOS doesn’t let other apps read ${source.browser}’s data.`,
          details: [
            `In ${source.browser}, choose File › Export Browsing Data to File, then bring that file in with Choose a File.`,
          ],
          undoToken: null,
          trashToken: null,
        };
      }
      throw error;
    }
  }

  /** A bookmark file, a password CSV, or Safari's whole export. */
  importFile(file: string, bytes: Uint8Array): ImportResult {
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error('That file is too large to be a browser’s export.');
    }
    const label = `Imported from ${path.basename(file)}`;
    const extension = path.extname(file).toLowerCase();
    const text = () => new TextDecoder().decode(bytes);
    if (extension === '.zip') return this.importArchive(file, bytes);
    if (extension === '.csv') return this.importLogins(text(), file);
    if (extension === '.json') {
      if (/"history"\s*:/.test(text().slice(0, 4096))) {
        return this.apply(label, {
          bookmarks: null,
          history: parseSafariHistoryExport(text()),
        });
      }
      return this.apply(label, {
        bookmarks: parseChromiumBookmarks(text()),
        history: null,
      });
    }
    if (extension === '.plist') {
      return this.apply(label, {
        bookmarks: parseSafariBookmarks(parseBinaryPlist(bytes)),
        history: null,
      });
    }
    const bookmarks = parseBookmarkHtml(text());
    if (countLinks(bookmarks) === 0) {
      return {
        summary: `No bookmarks found in ${path.basename(file)}.`,
        details: ['Splash reads the HTML bookmark file browsers export.'],
        undoToken: null,
        trashToken: null,
      };
    }
    return this.apply(label, { bookmarks, history: null });
  }

  private importArchive(file: string, bytes: Uint8Array): ImportResult {
    let total = 0;
    const files = unzipSync(bytes, {
      filter: ({ name, originalSize }) => {
        total += originalSize;
        if (total > MAX_FILE_BYTES) {
          throw new Error(
            'That archive is too large to be a browser’s export.',
          );
        }
        return /\.(html?|json|csv)$/i.test(name);
      },
    });
    const parts = Object.entries(files);
    const content = (pattern: RegExp) => {
      const entry = parts.find(([name]) => pattern.test(path.basename(name)));
      return entry ? new TextDecoder().decode(entry[1]) : null;
    };
    const bookmarksHtml = content(/^bookmarks.*\.html?$/i);
    const historyJson = content(/^history.*\.json$/i);
    const loginCsv = content(/^passwords.*\.csv$/i);
    if (!bookmarksHtml && !historyJson && !loginCsv) {
      return {
        summary: `Nothing to bring in from ${path.basename(file)}.`,
        details: ['It has no bookmarks, history or passwords Splash can read.'],
        undoToken: null,
        trashToken: null,
      };
    }
    const data = this.apply(`Imported from ${path.basename(file)}`, {
      bookmarks: bookmarksHtml ? parseBookmarkHtml(bookmarksHtml) : null,
      history: historyJson ? parseSafariHistoryExport(historyJson) : null,
    });
    if (!loginCsv) return data;
    const logins = this.importLogins(loginCsv, file);
    const undoData = data.undoToken;
    const undoLogins = logins.undoToken;
    return {
      summary: `${data.summary} ${logins.summary}`,
      details: [...data.details, ...logins.details],
      undoToken:
        undoData || undoLogins
          ? this.offerUndo(() => {
              if (undoData) this.undo(undoData);
              if (undoLogins) this.undo(undoLogins);
            })
          : null,
      trashToken: logins.trashToken,
    };
  }

  private importLogins(text: string, file: string): ImportResult {
    const { vault } = this.options;
    const parsed = parseLoginCsv(text);
    if (!parsed) {
      return {
        summary: `${path.basename(file)} isn’t a list of logins.`,
        details: ['It needs columns for the address and the password.'],
        undoToken: null,
        trashToken: null,
      };
    }
    if (!vault.available) {
      throw new Error(
        'macOS’s Keychain isn’t available, so passwords can’t be stored safely.',
      );
    }
    const done = vault.importLogins(parsed.logins);
    const trashToken = this.options.createId();
    this.csvFiles.set(trashToken, file);
    const details = [
      ...(done.unchanged > 0
        ? [`${count(done.unchanged, 'login')} already saved.`]
        : []),
      ...(parsed.skipped > 0
        ? [
            `${count(parsed.skipped, 'row')} skipped: no web address or password.`,
          ]
        : []),
      'That file holds your passwords unencrypted. Delete it once you’re done.',
    ];
    return {
      summary:
        done.updated > 0
          ? `Added ${count(done.added, 'login')} and updated ${done.updated}.`
          : `Added ${count(done.added, 'login')}.`,
      details,
      undoToken: this.offerUndo(done.undo),
      trashToken,
    };
  }

  private apply(
    label: string,
    data: { bookmarks: BookmarkNode[] | null; history: HistoryRow[] | null },
  ): ImportResult {
    const { preferences, store, createId } = this.options;
    const said: string[] = [];
    const details: string[] = [];
    const undos: (() => void)[] = [];

    if (data.bookmarks) {
      const merged = mergeBookmarks(
        preferences.get().collections,
        data.bookmarks,
        label,
        createId,
      );
      if (merged.added > 0) {
        preferences.update({ collections: merged.collections });
        undos.push(() =>
          preferences.update({
            collections: withoutFolder(
              preferences.get().collections,
              merged.rootId,
            ),
          }),
        );
        details.push(`Bookmarks are in a folder called “${label}”.`);
      }
      said.push(`${count(merged.added, 'bookmark')}`);
      if (merged.duplicates > 0) {
        details.push(`${count(merged.duplicates, 'bookmark')} already saved.`);
      }
      if (merged.unsupported > 0) {
        details.push(
          `${count(merged.unsupported, 'bookmark')} left out: scripts and local files can’t be bookmarks.`,
        );
      }
      if (merged.overLimit > 0) {
        details.push(
          `${count(merged.overLimit, 'bookmark')} left out: the library is full.`,
        );
      }
    }

    if (data.history) {
      const added = store.importHistory(data.history);
      if (added.length > 0) undos.push(() => store.forgetHistory(added));
      said.push(`${count(added.length, 'history entry', 'history entries')}`);
    }

    return {
      summary:
        undos.length === 0
          ? 'Nothing new: all of it is already in Splash.'
          : `Added ${said.join(' and ')}.`,
      details,
      undoToken: undos.length
        ? this.offerUndo(() => {
            for (const undo of undos) undo();
          })
        : null,
      trashToken: null,
    };
  }

  private offerUndo(undo: () => void): string {
    const token = this.options.createId();
    this.undos.set(token, undo);
    return token;
  }

  undo(token: string): boolean {
    const undo = this.undos.get(token);
    if (!undo) return false;
    this.undos.delete(token);
    undo();
    return true;
  }

  async trashFile(token: string): Promise<boolean> {
    const file = this.csvFiles.get(token);
    if (!file) return false;
    this.csvFiles.delete(token);
    await this.options.trash(file);
    return true;
  }
}

function count(amount: number, one: string, many = `${one}s`): string {
  return `${amount.toLocaleString('en')} ${amount === 1 ? one : many}`;
}
