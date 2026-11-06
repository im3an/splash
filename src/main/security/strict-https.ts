import { net, type Session } from 'electron';

const ANSWER_LIMIT_MS = 2_000;

/**
 * Whether a host insists on valid HTTPS (HSTS), by the browser's own list and
 * what the site has told it before. Chrome never lets you past a certificate
 * warning on those, and Electron leaves that to the app but offers no way to
 * ask. So this asks for a plain address on a port Chromium refuses to use:
 * HSTS is applied first and redirects, anything else fails at once. Neither
 * touches the network. Unsure counts as yes.
 */
export function requiresValidHttps(
  from: Session,
  hostname: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = net.request({
      url: `http://${hostname}:9/`,
      session: from,
      redirect: 'manual',
      credentials: 'omit',
      useSessionCookies: false,
    });
    const timer = setTimeout(() => finish(true), ANSWER_LIMIT_MS);
    const finish = (strict: boolean) => {
      clearTimeout(timer);
      resolve(strict);
      request.abort();
    };
    request.on('redirect', () => finish(true));
    request.on('response', () => finish(true));
    request.on('error', (error) =>
      finish(error.message !== 'net::ERR_UNSAFE_PORT'),
    );
    request.end();
  });
}
