/** What Splash asks before adding an extension from the Chrome Web Store. */

export const WEB_STORE_ORIGIN = 'https://chromewebstore.google.com';
export const WEB_STORE_URL = `${WEB_STORE_ORIGIN}/category/extensions`;

/** The parts of a manifest that say what an extension can reach. */
export interface StoreManifest {
  permissions?: unknown;
  host_permissions?: unknown;
  optional_host_permissions?: unknown;
  content_scripts?: unknown;
}

/** Only the store's own top-level page may ask for an install. */
export function isWebStoreFrame(frame: {
  origin: string;
  parent: unknown;
}): boolean {
  return frame.origin === WEB_STORE_ORIGIN && !frame.parent;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** In the order a person would care about them. */
const PERMISSION_WARNINGS: readonly [permission: string, warning: string][] = [
  ['debugger', 'Read and change everything in the pages it debugs'],
  ['nativeMessaging', 'Talk to other apps on this Mac'],
  ['proxy', 'Route your traffic through other servers'],
  ['history', 'See and change your browsing history'],
  ['tabs', 'See the address of every page you open'],
  ['webNavigation', 'See the address of every page you open'],
  ['cookies', 'Read and change your cookies on the sites it can reach'],
  ['webRequest', 'See your traffic on the sites it can reach'],
  ['declarativeNetRequest', 'Block or redirect requests on pages'],
  ['bookmarks', 'See and change your bookmarks'],
  ['topSites', 'See the sites you visit most'],
  ['downloads', 'Manage your downloads'],
  ['management', 'Manage your other extensions'],
  ['privacy', 'Change your privacy settings'],
  ['clipboardRead', 'Read what you copy'],
  ['clipboardWrite', 'Change what you copy'],
  ['geolocation', 'See your location'],
  ['identity', 'See your account details'],
  ['notifications', 'Show notifications'],
];

function isEverySite(pattern: string): boolean {
  return /^(<all_urls>|(\*|https?):\/\/\*\/\*)$/.test(pattern);
}

function hostOf(pattern: string): string | null {
  const match = /^(?:\*|https?|wss?):\/\/(?:\*\.)?([^/*]+)\//.exec(pattern);
  return match?.[1] ?? null;
}

/** What it can reach, in plain words, most serious first. */
export function permissionWarnings(manifest: StoreManifest): string[] {
  const permissions = strings(manifest.permissions);
  const scripts = Array.isArray(manifest.content_scripts)
    ? (manifest.content_scripts as { matches?: unknown }[]).flatMap((script) =>
        strings(script?.matches),
      )
    : [];
  // Manifest V2 keeps its site patterns among its permissions.
  const patterns = [
    ...strings(manifest.host_permissions),
    ...permissions.filter(
      (item) => item.includes('://') || item === '<all_urls>',
    ),
    ...scripts,
  ];

  const warnings: string[] = [];
  if (patterns.some(isEverySite)) {
    warnings.push('Read and change everything on every site you visit');
  } else {
    const hosts = [
      ...new Set(patterns.map(hostOf).filter((host) => host !== null)),
    ];
    if (hosts.length > 3) {
      warnings.push(`Read and change everything on ${hosts.length} sites`);
    } else if (hosts.length > 0) {
      warnings.push(`Read and change everything on ${hosts.join(', ')}`);
    }
  }
  for (const [permission, warning] of PERMISSION_WARNINGS) {
    if (permissions.includes(permission) && !warnings.includes(warning)) {
      warnings.push(warning);
    }
  }
  return warnings;
}

/** The words of the sheet shown before an extension is added. */
export function installPrompt(
  name: string,
  manifest: StoreManifest,
): { message: string; detail: string } {
  const warnings = permissionWarnings(manifest);
  const reach = warnings.length
    ? `It will be able to:\n${warnings.map((item) => `• ${item}`).join('\n')}`
    : 'It doesn’t ask for access to your sites or data.';
  return {
    message: `Add “${name}” to Splash?`,
    detail: `${reach}\n\nIt updates itself from the Chrome Web Store. Some extensions need Chrome features Splash doesn’t have yet, and may not work fully.`,
  };
}
