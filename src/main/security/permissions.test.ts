import type { SitePermission } from '../../shared/types';
import {
  decisionOf,
  resolvePermissionRequest,
  sitePermissionsFor,
  webOrigin,
  type PermissionDecisions,
} from './permissions';

function memoryDecisions(): PermissionDecisions & {
  values: Map<string, boolean>;
} {
  const values = new Map<string, boolean>();
  return {
    values,
    getPermission: (origin, permission) =>
      values.get(`${origin} ${permission}`) ?? null,
    setPermission: (origin, permission, granted) => {
      const key = `${origin} ${permission}`;
      if (granted === null) values.delete(key);
      else values.set(key, granted);
    },
  };
}

const ORIGIN = 'https://meet.example';

describe('sitePermissionsFor', () => {
  it('splits media requests into camera and microphone', () => {
    expect(sitePermissionsFor('media', ['video'])).toEqual(['camera']);
    expect(sitePermissionsFor('media', ['audio', 'video'])).toEqual([
      'camera',
      'microphone',
    ]);
    expect(sitePermissionsFor('media')).toEqual(['camera', 'microphone']);
  });

  it('maps the permissions Splash can grant and refuses the rest', () => {
    expect(sitePermissionsFor('geolocation')).toEqual(['location']);
    expect(sitePermissionsFor('notifications')).toEqual(['notifications']);
    expect(sitePermissionsFor('midiSysex')).toEqual(['midi']);
    expect(sitePermissionsFor('hid')).toBeNull();
    expect(sitePermissionsFor('openExternal')).toBeNull();
  });
});

describe('webOrigin', () => {
  it('accepts only web origins', () => {
    expect(webOrigin('https://a.com/path?q=1')).toBe('https://a.com');
    expect(webOrigin('file:///etc')).toBeNull();
    expect(webOrigin(undefined)).toBeNull();
  });
});

describe('resolvePermissionRequest', () => {
  it('asks once about undecided permissions and remembers the answer', async () => {
    const decisions = memoryDecisions();
    const ask = vi.fn<(undecided: SitePermission[]) => Promise<boolean>>(
      async () => true,
    );
    await expect(
      resolvePermissionRequest(
        decisions,
        ORIGIN,
        ['camera', 'microphone'],
        ask,
      ),
    ).resolves.toBe(true);
    expect(ask).toHaveBeenCalledWith(['camera', 'microphone']);

    await resolvePermissionRequest(decisions, ORIGIN, ['camera'], ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('only asks about what is still undecided', async () => {
    const decisions = memoryDecisions();
    decisions.setPermission(ORIGIN, 'camera', true);
    const ask = vi.fn(async () => true);
    await resolvePermissionRequest(
      decisions,
      ORIGIN,
      ['camera', 'microphone'],
      ask,
    );
    expect(ask).toHaveBeenCalledWith(['microphone']);
  });

  it('refuses without asking when anything is blocked', async () => {
    const decisions = memoryDecisions();
    decisions.setPermission(ORIGIN, 'microphone', false);
    const ask = vi.fn(async () => true);
    await expect(
      resolvePermissionRequest(
        decisions,
        ORIGIN,
        ['camera', 'microphone'],
        ask,
      ),
    ).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('remembers a refusal', async () => {
    const decisions = memoryDecisions();
    await resolvePermissionRequest(
      decisions,
      ORIGIN,
      ['location'],
      async () => false,
    );
    expect(decisionOf(decisions.getPermission(ORIGIN, 'location'))).toBe(
      'block',
    );
  });
});
