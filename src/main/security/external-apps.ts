import type { PageHandle } from '../browser/electron-page-host';
import {
  resolvePermissionRequest,
  webOrigin,
  type PermissionDecisions,
} from './permissions';

export interface ExternalAppDeps {
  /** The app macOS would open the link with, or '' when there's none. */
  appFor(url: string): string;
  open(url: string): void;
}

function schemeOf(url: string): string {
  return url.slice(0, url.indexOf(':')).toLowerCase();
}

/**
 * A page asked to open a link that belongs to another app (mailto:, tel:,
 * zoommtg: …). Splash names the app and asks first; the answer is
 * remembered for the site like any other permission. Links no app handles
 * say so instead of doing nothing.
 */
export async function requestExternalOpen(
  target: Pick<PageHandle, 'request' | 'blocked' | 'notify'> | undefined,
  pageUrl: string,
  url: string,
  decisions: PermissionDecisions,
  deps: ExternalAppDeps,
): Promise<boolean> {
  const origin = webOrigin(pageUrl);
  if (!target || !origin) return false;
  const scheme = schemeOf(url);
  // macOS names it as a bundle: "Mail.app".
  const app = deps.appFor(url).replace(/\.app$/i, '');
  if (!app) {
    target.notify({ kind: 'no-app', scheme });
    return false;
  }
  const granted = await resolvePermissionRequest(
    decisions,
    origin,
    ['apps'],
    (undecided) => target.request(origin, undecided, { app, scheme }),
  );
  if (granted) deps.open(url);
  else target.blocked(['apps']);
  return granted;
}
