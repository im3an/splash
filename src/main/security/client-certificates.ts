/** A macOS alert stops being usable with more buttons than this. */
const MAX_OFFERED = 8;

export interface OfferedCertificate {
  subjectName: string;
  issuerName: string;
  /** Seconds since the epoch. */
  validExpiry: number;
}

/** What identifies a certificate to its owner, in one button's width. */
export function certificateLabel(certificate: OfferedCertificate): string {
  const subject = certificate.subjectName || 'Unnamed certificate';
  return certificate.issuerName
    ? `${subject} (${certificate.issuerName})`
    : subject;
}

export interface CertificatePrompt {
  message: string;
  detail: string;
  buttons: string[];
  /** The button that sends nothing: the default, and what Esc presses. */
  cancelId: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'This site';
  }
}

/**
 * Asks which certificate, if any, a site may have. A certificate identifies
 * the user, so unlike Electron's default nothing is sent without being chosen,
 * and any failure sends nothing either.
 */
export async function chooseClientCertificate<T extends OfferedCertificate>(
  url: string,
  certificates: readonly T[],
  ask: (prompt: CertificatePrompt) => Promise<number>,
): Promise<T | undefined> {
  if (certificates.length === 0) return undefined;
  const offered = certificates.slice(0, MAX_OFFERED);
  const cancelId = offered.length;
  try {
    const choice = await ask({
      message: `${hostOf(url)} is asking for a certificate`,
      detail:
        'Sending one tells this site who you are. Send one only if you expect to sign in this way.',
      buttons: [...offered.map(certificateLabel), 'Don’t Send'],
      cancelId,
    });
    return offered[choice];
  } catch (error) {
    console.error('Could not ask about a client certificate', error);
    return undefined;
  }
}
