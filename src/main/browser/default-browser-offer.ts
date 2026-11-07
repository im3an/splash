import type { TrailStore } from '../storage/trail-store';

const KEY = 'default-browser-offer';

/** Splash asks on the third day it's used, once it has earned the question. */
export const OFFER_ON_DAY = 3;

interface OfferState {
  /** Different days Splash was opened on, counted up to the offer. */
  days: number;
  /** The last of them, as YYYY-MM-DD in local time. */
  lastDay: string | null;
  /** Shown once; never again, whatever the answer. */
  asked: boolean;
}

const FRESH: OfferState = { days: 0, lastDay: null, asked: false };

function read(saved: string | null): OfferState {
  if (!saved) return FRESH;
  try {
    const parsed = JSON.parse(saved) as Partial<OfferState>;
    return {
      days: typeof parsed.days === 'number' ? parsed.days : 0,
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : null,
      asked: parsed.asked === true,
    };
  } catch {
    return FRESH;
  }
}

function localDay(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DefaultBrowserOfferOptions {
  store: Pick<TrailStore, 'getPreference' | 'setPreference'>;
  /** Whether Splash already is the default, or can't become it (dev builds). */
  status: () => { isDefault: boolean; canChange: boolean };
  now?: () => number;
}

/**
 * Counts the days Splash is used and, on the third, says once that it can be
 * the default browser. Not on the first run, when nothing about it is known
 * yet, and never again after that: Settings › General keeps the button.
 */
export class DefaultBrowserOffer {
  private readonly now: () => number;
  private offeredThisLaunch = false;

  constructor(private readonly options: DefaultBrowserOfferOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Call once per launch. */
  countLaunch(): void {
    const state = read(this.options.store.getPreference(KEY));
    if (state.asked) return;
    const today = localDay(this.now());
    if (state.lastDay === today) return;
    this.save({ ...state, days: state.days + 1, lastDay: today });
  }

  /** True once, when the time has come; marks the offer as made. */
  take(): boolean {
    if (this.offeredThisLaunch) return false;
    const state = read(this.options.store.getPreference(KEY));
    if (state.asked || state.days < OFFER_ON_DAY) return false;
    const { isDefault, canChange } = this.options.status();
    if (!canChange) return false;
    // Already the default: nothing to ask, now or later.
    this.save({ ...state, asked: true });
    if (isDefault) return false;
    this.offeredThisLaunch = true;
    return true;
  }

  private save(state: OfferState) {
    try {
      this.options.store.setPreference(KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Could not save the default browser offer', error);
    }
  }
}
