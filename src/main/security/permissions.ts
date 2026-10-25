import type { PermissionDecision, SitePermission } from '../../shared/types';

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
  'sound',
  'ads',
  'midi',
  'clipboard',
];

export const PERMISSION_LABELS: Record<SitePermission, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
  location: 'Location',
  notifications: 'Notifications',
  sound: 'Sound',
  ads: 'Ads and trackers',
  midi: 'MIDI devices',
  clipboard: 'Clipboard',
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
