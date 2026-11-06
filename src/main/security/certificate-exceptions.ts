import { canContinuePastCertificateError } from '../../shared/certificate-errors';
import type { SitePermission } from '../../shared/types';

const ACCEPTED_KEY = 'certificates.accepted';

/** The part of a trail store an exception lives in. */
export interface CertificateStore {
  getPermission(origin: string, permission: SitePermission): boolean | null;
  setPermission(
    origin: string,
    permission: SitePermission,
    allowed: boolean | null,
  ): void;
  getPreference(key: string): string | null;
  setPreference(key: string, value: string): void;
}

function secureOrigin(url: string): string | null {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
}

function acceptedCertificates(store: CertificateStore): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(store.getPreference(ACCEPTED_KEY) ?? '');
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Whether the user chose to use a site despite its certificate. The site
 * settings row lets them see and take that back; the choice itself covers only
 * the certificate they were warned about, so a different one warns again.
 */
export function hasCertificateException(
  store: CertificateStore,
  url: string,
): boolean {
  const origin = secureOrigin(url);
  return !!origin && store.getPermission(origin, 'certificate') === true;
}

export class CertificateExceptions {
  /**
   * The certificate each site last showed that Splash turned down, or `null`
   * for a site that insists on valid HTTPS, where nothing can be accepted.
   */
  private readonly refused = new Map<string, string | null>();

  /** Whether the user already chose this site with this certificate. */
  decide(
    stores: readonly CertificateStore[],
    url: string,
    error: string,
    fingerprint: string,
  ): boolean {
    const origin = secureOrigin(url);
    if (!origin || !canContinuePastCertificateError(error)) return false;
    return stores.some(
      (store) =>
        hasCertificateException(store, url) &&
        acceptedCertificates(store)[origin] === fingerprint,
    );
  }

  /** Remembers what was turned down, for the warning that follows. */
  refuse(url: string, fingerprint: string, strict: boolean): void {
    const origin = secureOrigin(url);
    if (origin) this.refused.set(origin, strict ? null : fingerprint);
  }

  /** Whether this site's warning must not offer a way past it. */
  locked(url: string): boolean {
    const origin = secureOrigin(url);
    return !!origin && this.refused.get(origin) === null;
  }

  /** The user read the warning and wants to go on, with the certificate shown. */
  accept(store: CertificateStore, url: string): boolean {
    const origin = secureOrigin(url);
    const fingerprint = origin && this.refused.get(origin);
    if (!origin || !fingerprint) return false;
    store.setPreference(
      ACCEPTED_KEY,
      JSON.stringify({
        ...acceptedCertificates(store),
        [origin]: fingerprint,
      }),
    );
    store.setPermission(origin, 'certificate', true);
    return true;
  }
}
