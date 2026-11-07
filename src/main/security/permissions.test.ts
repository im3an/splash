import type { SitePermission } from '../../shared/types';
import {
  decisionOf,
  isAllowedOnAny,
  refusedBySystem,
  resolvePermissionRequest,
  sitePermissionsFor,
  systemSettingsUrl,
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

describe('what macOS refuses', () => {
  const access = (statuses: Record<string, string>, answer = false) => ({
    status: vi.fn((kind: 'camera' | 'microphone') => statuses[kind] ?? ''),
    ask: vi.fn(async () => answer),
  });

  it('refuses nothing that macOS already allows', async () => {
    const media = access({ camera: 'granted', microphone: 'granted' });
    expect(await refusedBySystem(['camera', 'microphone'], media)).toEqual([]);
    expect(media.ask).not.toHaveBeenCalled();
  });

  it('asks macOS when it hasn’t answered, and accepts a yes', async () => {
    const media = access({ camera: 'not-determined' }, true);
    expect(await refusedBySystem(['camera'], media)).toEqual([]);
    expect(media.ask).toHaveBeenCalledWith('camera');
  });

  it('names what macOS refused, and stops asking there', async () => {
    const media = access({ camera: 'denied', microphone: 'not-determined' });
    expect(await refusedBySystem(['camera', 'microphone'], media)).toEqual([
      'camera',
    ]);
    expect(media.ask).toHaveBeenCalledTimes(1);
  });

  it('leaves alone what macOS has no say in', async () => {
    const media = access({});
    expect(await refusedBySystem(['notifications', 'midi'], media)).toEqual([]);
    expect(media.status).not.toHaveBeenCalled();
  });
});

describe('whether a refusal came from below Splash', () => {
  it('needs the site to be allowed in Splash', () => {
    const decisions = memoryDecisions();
    const urls = ['https://a.example/map'];
    expect(isAllowedOnAny(decisions, 'location', urls)).toBe(false);
    decisions.setPermission('https://a.example', 'location', false);
    expect(isAllowedOnAny(decisions, 'location', urls)).toBe(false);
    decisions.setPermission('https://a.example', 'location', true);
    expect(isAllowedOnAny(decisions, 'location', urls)).toBe(true);
  });

  it('counts a frame’s site or the page’s, since either can hold the answer', () => {
    const decisions = memoryDecisions();
    decisions.setPermission('https://page.example', 'location', true);
    expect(
      isAllowedOnAny(decisions, 'location', [
        'https://frame.example/',
        'https://page.example/',
      ]),
    ).toBe(true);
  });

  it('ignores what isn’t a web address', () => {
    expect(
      isAllowedOnAny(memoryDecisions(), 'location', [undefined, 'about:blank']),
    ).toBe(false);
  });
});

describe('where macOS keeps each permission', () => {
  it('opens the matching pane of System Settings', () => {
    expect(systemSettingsUrl('location')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices',
    );
    expect(systemSettingsUrl('camera')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    );
    expect(systemSettingsUrl('microphone')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
  });
});
