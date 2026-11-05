import { siteOf } from './cookies';

type RequestHeaders = Record<string, string>;
type ResponseHeaders = Record<string, string[]>;

/** The privacy signal, as every request of a page carries it. */
export function withPrivacySignal(headers: RequestHeaders): RequestHeaders {
  return { ...headers, 'Sec-GPC': '1', DNT: '1' };
}

function webHostname(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? hostname : null;
  } catch {
    return null;
  }
}

/** Whether `url` belongs to another site than the page at `topUrl`. */
export function isThirdParty(url: string, topUrl: string): boolean {
  const host = webHostname(url);
  const top = webHostname(topUrl);
  return host !== null && top !== null && siteOf(host) !== siteOf(top);
}

export function withoutCookie(headers: RequestHeaders): RequestHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'cookie'),
  );
}

export function withoutSetCookie(headers: ResponseHeaders): ResponseHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== 'set-cookie',
    ),
  );
}

/** The policy that keeps what the user blocked off a page; null for none. */
export function contentPolicyFor(blocked: {
  scripts: boolean;
  images: boolean;
}): string | null {
  const directives = [
    ...(blocked.scripts ? ["script-src 'none'"] : []),
    ...(blocked.images ? ["img-src 'none'"] : []),
  ];
  return directives.length > 0 ? directives.join('; ') : null;
}
