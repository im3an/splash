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
    backing.setPreference('appearance', 'light');
    expect(new PreferencesService(backing).get().theme).toBe('light');
  });

  it('falls back to defaults for damaged saved preferences', () => {
    const backing = store();
    backing.setPreference('preferences', '{"density":"tiny"}');
    expect(new PreferencesService(backing).get()).toEqual(DEFAULT_PREFERENCES);
  });
});

it('recovers damaged preferences field by field while keeping valid bookmarks', () => {
  const backing = store();
  const collections = [
    {
      id: crypto.randomUUID(),
      name: 'Research',
      kind: 'folder',
      collapsed: false,
      links: [
        { id: crypto.randomUUID(), title: 'Docs', url: 'https://example.org/' },
      ],
    },
  ];
  const original = JSON.stringify({
    ...DEFAULT_PREFERENCES,
    theme: 'dark',
    density: 'broken',
    collections,
  });
  backing.setPreference('preferences', original);
  const service = new PreferencesService(backing);
  expect(service.get()).toMatchObject({
    theme: 'dark',
    density: 'comfortable',
    collections,
  });
  expect(backing.getPreference('preferences:recovery')).toBe(original);
  expect(service.recoveryWarning()).toContain('recovered');
});
it('repairs cyclic folders and invalid links without losing the valid library', () => {
  const backing = store();
  const id = crypto.randomUUID();
  const original = JSON.stringify({
    ...DEFAULT_PREFERENCES,
    collections: [
      {
        id,
        parentId: id,
        name: 'Recovered',
        kind: 'folder',
        collapsed: false,
        links: [
          {
            id: crypto.randomUUID(),
            title: 'Valid',
            url: 'https://example.org/',
          },
          {
            id: crypto.randomUUID(),
            title: 'Unsafe',
            url: 'javascript:alert(1)',
          },
        ],
      },
    ],
  });
  backing.setPreference('preferences', original);
  const service = new PreferencesService(backing);
  expect(service.get().collections[0]).toMatchObject({
    parentId: null,
    name: 'Recovered',
  });
  expect(service.get().collections[0]!.links).toHaveLength(1);
  expect(backing.getPreference('preferences:recovery')).toBe(original);
});
it('does not announce or replace settings after a failed preference write', () => {
  const backing = store();
  const service = new PreferencesService(backing);
  const listener = vi.fn();
  service.onChange(listener);
  vi.spyOn(backing, 'setPreference').mockImplementation(() => {
    throw new Error('Disk full');
  });
  expect(() => service.update({ theme: 'light' })).toThrow('Disk full');
  expect(service.get().theme).toBe('dark');
  expect(listener).not.toHaveBeenCalled();
});

it('retires saved current-page styles without resetting other preferences', () => {
  const backing = store();
  backing.setPreference(
    'preferences',
    JSON.stringify({
      ...DEFAULT_PREFERENCES,
      currentPage: 'outline',
      density: 'compact',
      theme: 'dark',
    }),
  );
  const service = new PreferencesService(backing);
  expect(service.get()).toEqual({
    ...DEFAULT_PREFERENCES,
    density: 'compact',
    theme: 'dark',
  });
  expect(service.recoveryWarning()).toBeNull();
});

it('loads readable fields even when the recovery backup cannot be written', () => {
  const backing = store();
  const original = JSON.stringify({
    ...DEFAULT_PREFERENCES,
    density: 'broken',
    theme: 'dark',
  });
  backing.setPreference('preferences', original);
  vi.spyOn(backing, 'setPreference').mockImplementation(() => {
    throw new Error('Read-only database');
  });
  const service = new PreferencesService(backing);
  expect(service.get().theme).toBe('dark');
  expect(service.recoveryWarning()).toContain('couldn’t save a recovery copy');
  expect(backing.getPreference('preferences')).toBe(original);
});
