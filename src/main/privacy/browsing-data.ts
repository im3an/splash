import type { ClearDataRequest, ClearRange } from '../../shared/types';
import type { HistoryRow, TrailStore } from '../storage/trail-store';

const HOUR = 60 * 60 * 1000;
const RANGE_MS: Record<Exclude<ClearRange, 'all'>, number> = {
  hour: HOUR,
  day: 24 * HOUR,
  week: 7 * 24 * HOUR,
};
const RANGE_LABEL: Record<ClearRange, string> = {
  hour: 'from the last hour',
  day: 'from the last 24 hours',
  week: 'from the last 7 days',
  all: 'from all time',
};
/** How long a history clear can still be undone. */
const UNDO_WINDOW_MS = 60_000;

export function rangeStart(range: ClearRange, now: number): number {
  return range === 'all' ? 0 : now - RANGE_MS[range];
}

export interface BrowsingDataCleanerOptions {
  store: Pick<
    TrailStore,
    'deleteHistory' | 'restoreHistory' | 'clearPermissions'
  >;
  /** Cookies, local storage, IndexedDB, service workers and the like. */
  clearSiteData(): Promise<void>;
  clearCache(): Promise<void>;
  clearDownloadList(): void;
  /** Recently closed pages keep their addresses; history clears them too. */
  forgetClosedPages(): void;
  now(): number;
  createToken(): string;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Clears what the user picked. History respects the time range and can be
 * undone for a minute; cookies, site data, cache and permissions are
 * cleared for all time and cannot be brought back.
 */
export class BrowsingDataCleaner {
  private readonly undo = new Map<
    string,
    { rows: HistoryRow[]; expires: number }
  >();

  constructor(private readonly options: BrowsingDataCleanerOptions) {}

  async clear(
    request: ClearDataRequest,
  ): Promise<{ summary: string; undoToken: string | null }> {
    const cleared: string[] = [];
    let undoToken: string | null = null;
    const now = this.options.now();

    if (request.history) {
      const rows = this.options.store.deleteHistory(
        rangeStart(request.range, now),
      );
      this.options.forgetClosedPages();
      cleared.push(`history ${RANGE_LABEL[request.range]}`);
      if (rows.length > 0) {
        undoToken = this.options.createToken();
        this.undo.set(undoToken, { rows, expires: now + UNDO_WINDOW_MS });
      }
    }
    if (request.cookies) {
      await this.options.clearSiteData();
      cleared.push('cookies and site data');
    }
    if (request.cache) {
      await this.options.clearCache();
      cleared.push('cached files');
    }
    if (request.permissions) {
      this.options.store.clearPermissions();
      cleared.push('site permissions');
    }
    if (request.downloads) {
      this.options.clearDownloadList();
      cleared.push('the download list');
    }

    const summary =
      cleared.length === 0
        ? 'Nothing was selected.'
        : `Cleared ${joinList(cleared)}.`;
    return { summary, undoToken };
  }

  /** Brings back cleared history, if it's still within the undo window. */
  restore(token: string): boolean {
    const entry = this.undo.get(token);
    this.undo.delete(token);
    if (!entry || entry.expires < this.options.now()) return false;
    this.options.store.restoreHistory(entry.rows);
    return true;
  }
}
