import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { session as sessions, type Session } from 'electron';
import type { WorkspaceId } from '../../shared/types';
import type { BrowsingDataCleaner } from '../privacy/browsing-data';
import type { CookieViewer } from '../privacy/cookies';
import type { SqliteTrailStore } from '../storage/sqlite-trail-store';
import type { TrailStore } from '../storage/trail-store';
import {
  abandonedProfileFolders,
  DEFAULT_PROFILE,
  defaultProfileOwner,
  partitionOf,
  profileKey,
} from './workspace-profiles';

/** A workspace's profile with everything wired to its session. */
export interface WorkspaceProfile {
  key: string;
  session: Session;
  /** Its history and site decisions; the rest of the store is shared. */
  store: TrailStore;
  cookies: CookieViewer;
  /** Clears its history, cookies, cache and site decisions. */
  cleaner: BrowsingDataCleaner;
}

export interface WorkspaceProfilesOptions {
  store: SqliteTrailStore;
  /**
   * Wires a profile's session the way pages need it: permissions, site
   * rules, the blocker, downloads, spelling and extensions. Called once per
   * profile, the first time one of its workspace's pages or panels needs it.
   */
  open(key: string, session: Session, store: TrailStore): WorkspaceProfile;
  /** Site data that must survive clearing: extensions' own storage. */
  keptOrigins(): string[];
}

/**
 * The profiles of the workspaces open in regular windows. Each is opened
 * when first needed and kept until quit; Electron can't close a session.
 */
export class WorkspaceProfiles {
  private readonly opened = new Map<string, WorkspaceProfile>();

  constructor(private readonly options: WorkspaceProfilesOptions) {}

  /** The workspace that keeps the profile every page used to share. */
  claimDefault(firstWorkspace: WorkspaceId | undefined): void {
    defaultProfileOwner(this.options.store, firstWorkspace);
  }

  keyOf(workspaceId: WorkspaceId): string {
    return profileKey(
      workspaceId,
      defaultProfileOwner(this.options.store, workspaceId),
    );
  }

  forWorkspace(workspaceId: WorkspaceId): WorkspaceProfile {
    return this.forKey(this.keyOf(workspaceId));
  }

  forKey(key: string): WorkspaceProfile {
    let profile = this.opened.get(key);
    if (!profile) {
      profile = this.options.open(
        key,
        sessions.fromPartition(partitionOf(key)),
        this.options.store.forProfile(key),
      );
      this.opened.set(key, profile);
    }
    return profile;
  }

  /** The profile a page or popup's session belongs to, if it is one. */
  ofSession(session: Session): WorkspaceProfile | undefined {
    for (const profile of this.opened.values()) {
      if (profile.session === session) return profile;
    }
    return undefined;
  }

  /** Every profile opened so far, the default one first. */
  all(): WorkspaceProfile[] {
    return [...this.opened.values()].sort(
      (a, b) =>
        Number(b.key === DEFAULT_PROFILE) - Number(a.key === DEFAULT_PROFILE),
    );
  }

  /**
   * A workspace was deleted: its sign-ins, site data, cache, history and site
   * decisions go now. Its extensions' own storage stays while Splash runs,
   * since the extensions are still running in it; the folder itself goes at
   * the next launch (`removeAbandoned`).
   */
  async forget(workspaceId: WorkspaceId): Promise<void> {
    const key = this.keyOf(workspaceId);
    const session = sessions.fromPartition(partitionOf(key));
    this.options.store.forgetProfile(key);
    await session.clearData({
      excludeOrigins: this.options.keptOrigins(),
    });
    await session.clearCache();
    await session.cookies.flushStore();
  }

  /**
   * Removes the profile folders of workspaces that are gone. Runs at launch,
   * before any of their sessions can be opened.
   */
  static async removeAbandoned(
    userData: string,
    liveWorkspaces: readonly WorkspaceId[],
    keyOf: (workspaceId: WorkspaceId) => string,
  ): Promise<string[]> {
    const root = path.join(userData, 'Partitions');
    const folders = await readdir(root).catch(() => [] as string[]);
    const live = new Set(liveWorkspaces.map(keyOf));
    const abandoned = abandonedProfileFolders(folders, live);
    for (const folder of abandoned) {
      await rm(path.join(root, folder), { recursive: true, force: true });
    }
    return abandoned;
  }
}
