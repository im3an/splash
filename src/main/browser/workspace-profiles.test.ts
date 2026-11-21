import { describe, expect, it } from 'vitest';
import {
  abandonedProfileFolders,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_OWNER,
  defaultProfileOwner,
  partitionOf,
  profileKey,
} from './workspace-profiles';

function preferences(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getPreference: (key: string) => values.get(key) ?? null,
    setPreference: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('profileKey', () => {
  it('gives the default owner the profile every page used to share', () => {
    expect(profileKey('first', 'first')).toBe(DEFAULT_PROFILE);
    expect(partitionOf(profileKey('first', 'first'))).toBe('persist:web');
  });

  it('gives every other workspace a profile of its own', () => {
    const id = '5b0e3a0c-1c1e-4c43-9f7a-0a8b5b4e2a11';
    expect(profileKey(id, 'first')).toBe(`ws-${id}`);
    expect(partitionOf(profileKey(id, 'first'))).toBe(`persist:ws-${id}`);
    expect(profileKey('second', null)).toBe('ws-second');
  });

  it('keeps a stored id from naming another folder', () => {
    expect(profileKey('../../Cookies', null)).toBe('ws-cookies');
    expect(profileKey('Ws/ABC', null)).toBe('ws-wsabc');
    expect(profileKey('///', null)).toBe('ws-unnamed');
  });
});

describe('defaultProfileOwner', () => {
  it('is the first workspace asked about, and stays so', () => {
    const store = preferences();
    expect(defaultProfileOwner(store, 'first')).toBe('first');
    expect(store.values.get(DEFAULT_PROFILE_OWNER)).toBe('first');
    expect(defaultProfileOwner(store, 'second')).toBe('first');
  });

  it('keeps the owner after an upgrade picked it', () => {
    const store = preferences({ [DEFAULT_PROFILE_OWNER]: 'saved-first' });
    expect(defaultProfileOwner(store, 'other')).toBe('saved-first');
  });

  it('is nobody until there is a workspace', () => {
    const store = preferences();
    expect(defaultProfileOwner(store, undefined)).toBeNull();
    expect(store.values.size).toBe(0);
  });
});

describe('abandonedProfileFolders', () => {
  it('finds the folders of workspaces that are gone', () => {
    expect(
      abandonedProfileFolders(
        ['web', 'ws-live', 'ws-deleted', 'other', '.DS_Store'],
        new Set(['web', 'ws-live']),
      ),
    ).toEqual(['ws-deleted']);
  });

  it('never offers the default profile, even with no workspaces', () => {
    expect(abandonedProfileFolders(['web'], new Set())).toEqual([]);
  });
});
