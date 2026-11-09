import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol, type Session } from 'electron';
import { STAND_IN_SCHEME } from '../privacy/stand-ins';

/**
 * Packaged builds serve Splash's own windows from `app://splash/`, not
 * `file://`: a privileged origin of their own that web pages can't load,
 * so `file:` needs no extra privileges (see the fuse in forge.config.mts).
 */
const SHELL_SCHEME = 'app';
const SHELL_HOST = 'splash';

/** Where the shell UI is served from: the Vite dev server or the app bundle. */
export function shellUrl(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  return `${SHELL_SCHEME}://${SHELL_HOST}/index.html`;
}

/**
 * Before `ready`. Registration replaces any earlier one, so the extension
 * library's `crx:` scheme is declared here too, as it declares it.
 */
export function registerShellScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'crx', privileges: { bypassCSP: true } },
    // The blocker's stand-ins for blocked scripts. A page's CSP lets its own
    // script through, so it has to let the stand-in through too.
    {
      scheme: STAND_IN_SCHEME,
      privileges: { standard: true, secure: true, bypassCSP: true },
    },
    {
      scheme: SHELL_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/** Answers `app://splash/…` with the bundled renderer files, and nothing else. */
export function serveShell(session: Session): void {
  const root = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  session.protocol.handle(SHELL_SCHEME, (request) => {
    const file = shellFile(root, request.url);
    return file
      ? net.fetch(pathToFileURL(file).href)
      : new Response(null, { status: 404 });
  });
}

/** The bundled file an `app://splash/` URL names, or null outside the bundle. */
export function shellFile(root: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SHELL_SCHEME}:` || parsed.host !== SHELL_HOST)
    return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const file = path.resolve(root, `.${pathname}`);
  return file.startsWith(root + path.sep) ? file : null;
}

/** Whether `candidate` is the shell document (any hash), not some other page. */
export function isSameDocument(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    // Custom schemes have an opaque ("null") origin, so compare in full.
    return b.protocol === 'http:' || b.protocol === 'https:'
      ? a.origin === b.origin
      : a.protocol === b.protocol &&
          a.host === b.host &&
          a.pathname === b.pathname;
  } catch {
    return false;
  }
}
