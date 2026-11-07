import { EventEmitter } from 'node:events';
import type { PreferencesService } from '../preferences';
import type { ContentBlockingHost } from '../privacy/electron-content-blocker';
import type { ThreatList } from '../security/threat-list';
import type { TrailStore } from '../storage/trail-store';
import { openPrivateProfile } from './private-profile';

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
