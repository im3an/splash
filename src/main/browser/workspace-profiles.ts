import type { WorkspaceId } from '../../shared/types';

/**
 * Every workspace is a profile of its own: its own cookies and sign-ins,
 * storage, cache, site decisions and history. A profile is named by a key;
 * its Electron partition is `persist:<key>`, and the database keeps its
 * history and site decisions under the same key.
 *
 * Before workspaces had profiles, every page shared `persist:web`. The first
 * workspace keeps that one, so it stays signed in where it was; each other
 * workspace starts a new profile.
 */
export const DEFAULT_PROFILE = 'web';

/** The preference naming the workspace that keeps `DEFAULT_PROFILE`. */
export const DEFAULT_PROFILE_OWNER = 'profiles.default-owner';

/** Where a workspace's own profile lives, as a folder under `Partitions/`. */
const OWN_PROFILE_PREFIX = 'ws-';

type Preferences = {
  getPreference(key: string): string | null;
  setPreference(key: string, value: string): void;
};

/** The profile key for a workspace, given which one keeps the default. */
export function profileKey(
  workspaceId: WorkspaceId,
  defaultOwner: WorkspaceId | null,
): string {
  if (workspaceId === defaultOwner) return DEFAULT_PROFILE;
  // Partition names become folder names; ids are UUIDs, but a stored id is
  // only trusted this far.
  const safe = workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${OWN_PROFILE_PREFIX}${safe || 'unnamed'}`;
}

/** The Electron partition a profile's pages browse in. */
export function partitionOf(profile: string): string {
  return `persist:${profile}`;
}

/**
 * Which workspace keeps the default profile. Decided once: the first
 * workspace of the saved session, or, on a new profile, the first one asked
 * about. Later workspaces never take it, even after the owner is deleted, so
 * a deleted workspace's sign-ins can't turn up in another.
 */
export function defaultProfileOwner(
  store: Preferences,
  candidate: WorkspaceId | undefined,
): WorkspaceId | null {
  const owner = store.getPreference(DEFAULT_PROFILE_OWNER);
  if (owner) return owner;
  if (!candidate) return null;
  store.setPreference(DEFAULT_PROFILE_OWNER, candidate);
  return candidate;
}

/**
 * Profile folders under `Partitions/` that belong to no workspace: what a
 * deleted workspace left behind. Only workspace profiles are considered; the
 * default profile and anything Splash didn't name stay.
 */
export function abandonedProfileFolders(
  folders: readonly string[],
  liveProfiles: ReadonlySet<string>,
): string[] {
  return folders.filter(
    (folder) =>
      folder.startsWith(OWN_PROFILE_PREFIX) && !liveProfiles.has(folder),
  );
}
