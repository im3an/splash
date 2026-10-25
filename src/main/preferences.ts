import { DEFAULT_PREFERENCES, type Preferences } from '../shared/preferences';
import { preferencesSchema } from '../shared/ipc';
import type { TrailStore } from './storage/trail-store';

const KEY = 'preferences';
/** Before Settings existed, View › Appearance saved only the theme here. */
const LEGACY_THEME_KEY = 'appearance';

/** App-wide settings: loaded once, saved on change, announced to listeners. */
export class PreferencesService {
  private current: Preferences;
  private readonly listeners = new Set<(preferences: Preferences) => void>();

  constructor(private readonly store: TrailStore) {
    this.current = this.load();
  }

  get(): Preferences {
    return this.current;
  }

  update(patch: Partial<Preferences>): Preferences {
    const next = preferencesSchema.parse({ ...this.current, ...patch });
    this.current = next;
    try {
      this.store.setPreference(KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Could not save preferences', error);
    }
    for (const listener of this.listeners) listener(next);
    return next;
  }

  onChange(listener: (preferences: Preferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Preferences {
    try {
      const saved = this.store.getPreference(KEY);
      if (saved) {
        const parsed = preferencesSchema.safeParse({
          ...DEFAULT_PREFERENCES,
          ...JSON.parse(saved),
        });
        if (parsed.success) return parsed.data;
      }
      const legacyTheme = this.store.getPreference(LEGACY_THEME_KEY);
      if (legacyTheme === 'light' || legacyTheme === 'dark') {
        return { ...DEFAULT_PREFERENCES, theme: legacyTheme };
      }
    } catch (error) {
      console.error('Could not read preferences', error);
    }
    return DEFAULT_PREFERENCES;
  }
}
