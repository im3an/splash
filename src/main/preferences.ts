import { randomUUID } from 'node:crypto';
import { DEFAULT_PREFERENCES, type Preferences } from '../shared/preferences';
import { preferencesSchema } from '../shared/ipc';
import type { TrailStore } from './storage/trail-store';

const KEY = 'preferences';
/** Before Settings existed, View › Appearance saved only the theme here. */
const LEGACY_THEME_KEY = 'appearance';

/** App-wide settings: loaded once, saved on change, announced to listeners. */
export class PreferencesService {
  private current: Preferences;
  private recovery: string | null = null;
  private readonly listeners = new Set<(preferences: Preferences) => void>();

  constructor(private readonly store: TrailStore) {
    this.current = this.load();
  }

  recoveryWarning(): string | null {
    return this.recovery;
  }

  get(): Preferences {
    return this.current;
  }

  update(patch: Partial<Preferences>): Preferences {
    const next = preferencesSchema.parse({ ...this.current, ...patch });
    this.store.setPreference(KEY, JSON.stringify(next));
    this.current = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }

  onChange(listener: (preferences: Preferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private backup(saved: string): void {
    this.recovery =
      'Splash recovered valid settings and bookmarks from damaged preferences. Unreadable values were reset. A recovery copy of the original settings is kept on this Mac.';
    try {
      if (this.store.getPreference('preferences:recovery') === null)
        this.store.setPreference('preferences:recovery', saved);
    } catch {
      // A full/read-only disk must not prevent valid fields from loading.
      // The original preferences key is untouched until a later successful save.
      this.recovery =
        'Splash recovered readable settings, but couldn’t save a recovery copy. The original stored settings have not been replaced. Check available disk space before changing settings.';
    }
  }

  private load(): Preferences {
    try {
      const saved = this.store.getPreference(KEY);
      if (saved) {
        let raw: unknown;
        try {
          raw = JSON.parse(saved);
        } catch {
          this.backup(saved);
          return { ...DEFAULT_PREFERENCES };
        }
        const values =
          raw !== null && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        // The current-page appearance is now shared by every sidebar row.
        delete values.currentPage;
        const parsed = preferencesSchema.safeParse({
          ...DEFAULT_PREFERENCES,
          ...values,
        });
        if (parsed.success) return parsed.data;
        this.backup(saved);
        // Recover fields independently. A damaged density must not reset a
        // valid bookmark library, toolbar layout or privacy setting.
        const recovered: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
        for (const [key, schema] of Object.entries(preferencesSchema.shape)) {
          const field = schema.safeParse(values[key]);
          if (field.success) recovered[key] = field.data;
        }
        if (Array.isArray(values.collections)) {
          const ids = new Set<string>();
          const schema = preferencesSchema.shape.collections.element;
          const linksSchema = schema.shape.links.element;
          const collections = values.collections
            .slice(0, 200)
            .flatMap((value) => {
              if (!value || typeof value !== 'object' || Array.isArray(value))
                return [];
              const record = value as Record<string, unknown>;
              const linkIds = new Set<string>();
              const links = Array.isArray(record.links)
                ? record.links.slice(0, 1000).flatMap((link) => {
                    const parsed = linksSchema.safeParse(link);
                    if (!parsed.success) return [];
                    const item = parsed.data;
                    if (linkIds.has(item.id)) item.id = randomUUID();
                    linkIds.add(item.id);
                    return [item];
                  })
                : [];
              const parsed = schema.safeParse({ ...record, links });
              if (!parsed.success) return [];
              const item = parsed.data;
              if (ids.has(item.id)) item.id = randomUUID();
              ids.add(item.id);
              return [item];
            });
          for (const item of collections) {
            const seen = new Set([item.id]);
            let parent = item.parentId;
            while (parent) {
              const ancestor = collections.find(
                (value) => value.id === parent && value.kind === 'folder',
              );
              if (!ancestor || seen.has(parent)) {
                item.parentId = null;
                break;
              }
              seen.add(parent);
              parent = ancestor.parentId;
            }
          }
          recovered.collections = collections;
        }
        return preferencesSchema.parse(recovered);
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
