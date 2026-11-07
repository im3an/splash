import type {
  PermissionDecision,
  SitePermission,
  SystemPermission,
} from '../../shared/types';

/** Granted without asking: harmless, and expected to just work. */
export const AUTO_GRANTED = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write',
]);

/** Permissions shown in site info, in display order. */
export const SITE_PERMISSIONS: readonly SitePermission[] = [
  'camera',
  'microphone',
  'location',
  'notifications',
  'popups',
  'sound',
  'ads',
  'javascript',
  'images',
  'autoplay',
  'third-party-cookies',
  'dangerous',
  'certificate',
  'midi',
  'clipboard',
  'apps',
  'insecure',
  'save-passwords',
  'picture-in-picture',
];

export const PERMISSION_LABELS: Record<SitePermission, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
  location: 'Location',
  notifications: 'Notifications',
  popups: 'Popups',
  sound: 'Sound',
  ads: 'Ads and trackers',
  midi: 'MIDI devices',
  clipboard: 'Clipboard',
  apps: 'Open apps',
  insecure: 'Unencrypted HTTP',
  javascript: 'JavaScript',
  images: 'Images',
  autoplay: 'Autoplay',
  'third-party-cookies': 'Third-party cookies',
  dangerous: 'Reported as dangerous',
  certificate: 'Untrusted certificate',
  'save-passwords': 'Offer to save passwords',
  'picture-in-picture': 'Picture in picture',
};

/**
 * The site permissions a Chromium permission request needs, or `null` for
 * requests Splash never grants (they are denied and reported as blocked).
 */
export function sitePermissionsFor(
  permission: string,
  mediaTypes: readonly string[] = [],
): SitePermission[] | null {
  switch (permission) {
    case 'media': {
      const needed: SitePermission[] = [];
      if (mediaTypes.includes('video')) needed.push('camera');
      if (mediaTypes.includes('audio')) needed.push('microphone');
      return needed.length > 0 ? needed : ['camera', 'microphone'];
    }
    case 'geolocation':
      return ['location'];
    case 'notifications':
      return ['notifications'];
    case 'midi':
    case 'midiSysex':
      return ['midi'];
    case 'clipboard-read':
      return ['clipboard'];
    default:
      return null;
  }
}

/** Only real web origins can hold permissions. */
export function webOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export interface PermissionDecisions {
  getPermission(origin: string, permission: SitePermission): boolean | null;
  setPermission(
    origin: string,
    permission: SitePermission,
    granted: boolean | null,
  ): void;
}

export function decisionOf(granted: boolean | null): PermissionDecision {
  return granted === null ? 'ask' : granted ? 'allow' : 'block';
}

/**
 * Settles a request from remembered decisions where it can, and asks the
 * user about the rest. Any blocked permission blocks the whole request,
 * as Chromium expects one answer for it.
 */
export async function resolvePermissionRequest(
  decisions: PermissionDecisions,
  origin: string,
  permissions: SitePermission[],
  ask: (undecided: SitePermission[]) => Promise<boolean>,
): Promise<boolean> {
  const known = permissions.map((permission) =>
    decisions.getPermission(origin, permission),
  );
  if (known.includes(false)) return false;
  const undecided = permissions.filter((_, index) => known[index] === null);
  if (undecided.length === 0) return true;
  const granted = await ask(undecided);
  for (const permission of undecided) {
    decisions.setPermission(origin, permission, granted);
  }
  return granted;
}

/** How Electron reaches macOS's own answer about a camera or microphone. */
export interface SystemMediaAccess {
  status(kind: 'camera' | 'microphone'): string;
  ask(kind: 'camera' | 'microphone'): Promise<boolean>;
}

/**
 * What macOS refuses of what a site was just given, asking it if it hasn't
 * answered yet. The location isn't here because Electron can't ask about it: see
 * `watchLocationRefusals`.
 */
export async function refusedBySystem(
  permissions: readonly SitePermission[],
  access: SystemMediaAccess,
): Promise<SystemPermission[]> {
  for (const kind of ['camera', 'microphone'] as const) {
    if (!permissions.includes(kind)) continue;
    if (access.status(kind) === 'granted') continue;
    if (!(await access.ask(kind))) return [kind];
  }
  return [];
}

/**
 * A refused request reaches Splash from a frame in a page, and either one's site
 * can hold the answer the user gave. A refusal on an allowed site came from below
 * Splash; on any other, Splash refused it itself.
 */
export function isAllowedOnAny(
  decisions: Pick<PermissionDecisions, 'getPermission'>,
  permission: SitePermission,
  urls: readonly (string | undefined)[],
): boolean {
  return urls.some((url) => {
    const origin = webOrigin(url);
    return (
      origin !== null && decisions.getPermission(origin, permission) === true
    );
  });
}

const SYSTEM_SETTINGS_PANES: Record<SystemPermission, string> = {
  camera: 'Privacy_Camera',
  microphone: 'Privacy_Microphone',
  location: 'Privacy_LocationServices',
};

/** The pane of System Settings where macOS keeps this permission. */
export function systemSettingsUrl(permission: SystemPermission): string {
  return `x-apple.systempreferences:com.apple.preference.security?${SYSTEM_SETTINGS_PANES[permission]}`;
}
