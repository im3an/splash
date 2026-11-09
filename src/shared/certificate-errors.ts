/**
 * Certificate errors a person can sensibly decide about: a self-signed or
 * private authority, an expired date, a certificate made out to another name.
 * A revoked or malformed certificate has no such good reason, and Chrome
 * doesn't let you past those either.
 */
const CAN_CONTINUE: Readonly<Record<number, string>> = {
  [-200]: 'net::ERR_CERT_COMMON_NAME_INVALID',
  [-201]: 'net::ERR_CERT_DATE_INVALID',
  [-202]: 'net::ERR_CERT_AUTHORITY_INVALID',
};

export function canContinuePastCertificate(code: number): boolean {
  return code in CAN_CONTINUE;
}

/** The same check, for the name Electron's `certificate-error` reports. */
export function canContinuePastCertificateError(name: string): boolean {
  return Object.values(CAN_CONTINUE).includes(name);
}
