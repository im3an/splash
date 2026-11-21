import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PreferencesService } from '../preferences';
import type { ContentBlockingHost } from '../privacy/electron-content-blocker';
import type { ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import { openPrivateProfile, sweepPrivateProfiles } from './private-profile';

const mocks = vi.hoisted(() => ({
  fromPartition: vi.fn(),
  configureWeb: vi.fn(),
  denyPermissions: vi.fn(),
  uninstall: vi.fn(),
}));
vi.mock('electron', () => ({
  session: { fromPartition: mocks.fromPartition },
  app: { getPath: () => '/tmp' },
  dialog: {},
  shell: {},
}));
vi.mock('./electron-page-host', () => ({ pageHandleFor: () => undefined }));
vi.mock('../security/web-security', () => ({
  configureWebSession: mocks.configureWeb,
  configureAppSession: mocks.denyPermissions,
}));
vi.mock('../privacy/electron-site-rules', () => ({
  createSiteRules: () => ({ uninstall: mocks.uninstall }),
}));

it('detaches a discarded profile and clears its cache even when data clearing fails', async () => {
  const web = Object.assign(new EventEmitter(), {
    clearData: vi.fn(async () => {
      throw new Error('clear failed');
    }),
    clearCache: vi.fn(async () => undefined),
    cookies: {},
  });
  mocks.fromPartition.mockReturnValue(web);
  const detachSession = vi.fn();
  const profile = openPrivateProfile({
    store: { getPermission: () => null } as unknown as TrailStore,
    preferences: { get: () => ({ downloads: 'folder' }) } as PreferencesService,
    threats: {} as ThreatList,
    blocker: {
      attachSession: vi.fn(),
      detachSession,
    } as unknown as ContentBlockingHost,
    onDownloads: vi.fn(),
  });
  expect(web.listenerCount('will-download')).toBe(1);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await profile.discard();
    expect(web.listenerCount('will-download')).toBe(0);
    expect(web.clearCache).toHaveBeenCalledOnce();
    expect(detachSession).toHaveBeenCalledWith(web);
    expect(mocks.denyPermissions).toHaveBeenCalledWith(web);
    expect(mocks.uninstall).toHaveBeenCalledOnce();
    expect(() => profile.store.getPreference('any')).toThrow();
    expect(error).toHaveBeenCalledOnce();
  } finally {
    error.mockRestore();
  }
});

function blocker() {
  return {
    attachSession: vi.fn(),
    detachSession: vi.fn(),
  } as unknown as ContentBlockingHost;
}

it('opens each private profile in a partition of its own on disk, so extensions can run there', () => {
  mocks.fromPartition.mockReturnValue(
    Object.assign(new EventEmitter(), { cookies: {} }),
  );
  openPrivateProfile({
    store: { getPermission: () => null } as unknown as TrailStore,
    preferences: { get: () => ({ downloads: 'folder' }) } as PreferencesService,
    threats: {} as ThreatList,
    blocker: blocker(),
    onDownloads: vi.fn(),
  });
  expect(mocks.fromPartition).toHaveBeenLastCalledWith(
    expect.stringMatching(/^persist:private-[0-9a-f-]{36}$/),
  );
});

it('deletes the profile’s folder and stops its extensions when discarded', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'splash-private-'));
  writeFileSync(path.join(folder, 'Cookies'), 'x');
  const removeExtension = vi.fn();
  const web = Object.assign(new EventEmitter(), {
    clearData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
    cookies: {},
    storagePath: folder,
    extensions: {
      getAllExtensions: () => [{ id: 'ublock' }, { id: 'helper' }],
      removeExtension,
    },
  });
  mocks.fromPartition.mockReturnValue(web);
  const profile = openPrivateProfile({
    store: { getPermission: () => null } as unknown as TrailStore,
    preferences: { get: () => ({ downloads: 'folder' }) } as PreferencesService,
    threats: {} as ThreatList,
    blocker: blocker(),
    onDownloads: vi.fn(),
  });
  await profile.discard();
  expect(removeExtension.mock.calls).toEqual([['ublock'], ['helper']]);
  expect(existsSync(folder)).toBe(false);
});

it('sweeps only private profiles’ folders', () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'splash-user-data-'));
  try {
    const partitions = path.join(userData, 'Partitions');
    for (const name of ['private-1', 'private-2', 'web', 'workspace-a']) {
      mkdirSync(path.join(partitions, name, 'Local Storage'), {
        recursive: true,
      });
    }
    sweepPrivateProfiles(userData);
    expect(readdirSync(partitions).sort()).toEqual(['web', 'workspace-a']);
    // No Partitions folder yet: nothing to do.
    sweepPrivateProfiles(path.join(userData, 'missing'));
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});
