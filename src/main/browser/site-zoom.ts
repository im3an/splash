import type { Preferences } from '../../shared/preferences';

type ZoomPreferences = Pick<Preferences, 'defaultZoom' | 'siteZoom'>;

/** The name a site's zoom is kept under; `null` for what isn't a web page. */
export function zoomHost(url: string): string | null {
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? host : null;
  } catch {
    return null;
  }
}

/** The zoom a page at `url` should have: the site's own, or the default. */
export function zoomFor(preferences: ZoomPreferences, url: string): number {
  const host = zoomHost(url);
  return (host && preferences.siteZoom[host]) || preferences.defaultZoom;
}

/**
 * The site list after the user zoomed a site, or `null` if nothing changes.
 * A site at the default has no entry, so it follows the default if it moves.
 */
export function rememberZoom(
  preferences: ZoomPreferences,
  url: string,
  percent: number,
): Record<string, number> | null {
  const host = zoomHost(url);
  if (!host || preferences.siteZoom[host] === percent) return null;
  const atDefault = percent === preferences.defaultZoom;
  if (atDefault && !(host in preferences.siteZoom)) return null;
  const { [host]: _previous, ...others } = preferences.siteZoom;
  return atDefault ? others : { ...others, [host]: percent };
}
