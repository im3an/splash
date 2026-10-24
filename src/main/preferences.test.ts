import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_PREFERENCES } from '../shared/preferences';
import { PreferencesService } from './preferences';
import { SqliteTrailStore } from './storage/sqlite-trail-store';

function store() {
  return new SqliteTrailStore(new DatabaseSync(':memory:'));
}

describe('PreferencesService', () => {
  it('starts with defaults and keeps changes', () => {
    const backing = store();
    const service = new PreferencesService(backing);
    expect(service.get()).toEqual(DEFAULT_PREFERENCES);
    const listener = vi.fn();
    service.onChange(listener);
    service.update({ searchEngine: 'google', awakePages: 24 });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ searchEngine: 'google' }),
    );
    expect(new PreferencesService(backing).get()).toMatchObject({
      searchEngine: 'google',
      awakePages: 24,
    });
  });

  it('rejects invalid values without changing anything', () => {
    const service = new PreferencesService(store());
    expect(() => service.update({ awakePages: 0 } as never)).toThrow();
    expect(service.get()).toEqual(DEFAULT_PREFERENCES);
  });

  it('adopts the theme saved before Settings existed', () => {
    const backing = store();
    backing.setPreference('appearance', 'dark');
    expect(new PreferencesService(backing).get().theme).toBe('dark');
  });

  it('falls back to defaults for damaged saved preferences', () => {
    const backing = store();
    backing.setPreference('preferences', '{"density":"tiny"}');
    expect(new PreferencesService(backing).get()).toEqual(DEFAULT_PREFERENCES);
  });
});
