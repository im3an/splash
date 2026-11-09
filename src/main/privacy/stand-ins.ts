import { randomUUID } from 'node:crypto';

/**
 * Where the blocker's stand-ins for blocked scripts are served from. Chromium
 * refuses a redirect to a `data:` address (ERR_UNSAFE_REDIRECT), so the page
 * saw a failed script where uBlock Origin gives a working one. This scheme is
 * registered to bypass a page's CSP, as extension resources do in Chrome.
 */
export const STAND_IN_SCHEME = 'splash-stand-in';

/**
 * The host for this launch. A page that doesn't know it gets nothing, so it
 * can't load a stand-in to find out it's in Splash with blocking on.
 */
export const STAND_IN_SECRET = randomUUID();

export function standInUrl(secret: string, name: string): string {
  return `${STAND_IN_SCHEME}://${secret}/${encodeURIComponent(name)}`;
}

/** The resource a stand-in address names, if it carries this launch's secret. */
export function standInName(url: string, secret: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${STAND_IN_SCHEME}:` || parsed.host !== secret)
    return null;
  try {
    return decodeURIComponent(parsed.pathname.slice(1)) || null;
  } catch {
    return null;
  }
}

/** A list resource as a response: some, such as images, are kept in base64. */
export function standInBody(resource: { contentType: string; body: string }): {
  contentType: string;
  body: string | Uint8Array<ArrayBuffer>;
} {
  const [contentType = '', encoding] = resource.contentType.split(';');
  return encoding?.trim() === 'base64'
    ? {
        contentType,
        body: new Uint8Array(Buffer.from(resource.body, 'base64')),
      }
    : { contentType: resource.contentType, body: resource.body };
}
