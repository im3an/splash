import type { ClearOnQuit } from '../../shared/preferences';
import type { ClearDataRequest } from '../../shared/types';
import type { TrailStore } from '../storage/trail-store';

/** Set while Splash runs; a launch that finds it knows the last quit failed. */
const UNCLEARED_KEY = 'clear-on-quit:pending';
/** Quitting never waits on this longer; the next launch finishes the job. */
const TIMEOUT_MS = 5000;

export interface QuitClearOptions {
  store: Pick<TrailStore, 'getPreference' | 'setPreference'>;
  chosen(): ClearOnQuit;
  clear(request: ClearDataRequest): Promise<unknown>;
  timeoutMs?: number;
}

/**
 * Clears what the user chose whenever Splash quits. A crash or a forced quit
 * never gets that far, so the choice also holds at the next launch.
 */
export class QuitClear {
  constructor(private readonly options: QuitClearOptions) {}

  async atLaunch(): Promise<void> {
    const { store } = this.options;
    try {
      if (store.getPreference(UNCLEARED_KEY) === '1') await this.clearChosen();
      store.setPreference(UNCLEARED_KEY, '1');
    } catch (error) {
      console.error('Splash could not clear data at launch', error);
    }
  }

  async atQuit(): Promise<void> {
    try {
      await this.clearChosen();
      this.options.store.setPreference(UNCLEARED_KEY, '0');
    } catch (error) {
      console.error('Splash could not clear data when quitting', error);
    }
  }

  private async clearChosen(): Promise<void> {
    const chosen = this.options.chosen();
    if (!Object.values(chosen).some(Boolean)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Clearing took too long')),
        this.options.timeoutMs ?? TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([
        this.options.clear({ ...chosen, range: 'all', permissions: false }),
        timedOut,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
