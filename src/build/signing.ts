/*
 * Build-time only: forge.config.mts reads this, the app never does.
 *
 * A Developer ID build needs two things on the Mac that builds it, and neither
 * lives in the repository:
 * - the "Developer ID Application" certificate in the login keychain, named in
 *   SPLASH_SIGNING_IDENTITY ("Developer ID Application: Name (TEAMID)");
 * - a notarytool profile in the keychain, named in SPLASH_NOTARY_PROFILE, made
 *   once with `xcrun notarytool store-credentials`.
 * With neither set, builds stay signed ad hoc, as for the closed beta.
 */

export interface Signing {
  identity: string;
  notaryProfile: string;
}

export function signingFrom(
  env: Record<string, string | undefined>,
): Signing | null {
  const identity = env.SPLASH_SIGNING_IDENTITY?.trim() ?? '';
  const notaryProfile = env.SPLASH_NOTARY_PROFILE?.trim() ?? '';
  if (!identity && !notaryProfile) return null;
  if (!notaryProfile) {
    throw new Error(
      'SPLASH_SIGNING_IDENTITY is set but SPLASH_NOTARY_PROFILE isn’t. A signed app that isn’t notarised is still refused by macOS: set both, or neither for an ad-hoc build.',
    );
  }
  if (!identity) {
    throw new Error(
      'SPLASH_NOTARY_PROFILE is set but SPLASH_SIGNING_IDENTITY isn’t: set both, or neither for an ad-hoc build.',
    );
  }
  if (!identity.startsWith('Developer ID Application:')) {
    throw new Error(
      `SPLASH_SIGNING_IDENTITY must be a "Developer ID Application: …" certificate, the kind for apps outside the App Store. Got "${identity}".`,
    );
  }
  return { identity, notaryProfile };
}

/**
 * For Electron Packager. osx-sign turns on the hardened runtime and gives each
 * part its default entitlements, which already cover the camera, microphone,
 * location and V8's JIT. Notarising staples the ticket to the app. Packager
 * would turn a failed signature into a warning and leave the ad-hoc one, so a
 * wrong certificate surfaced only later, as a puzzling notarisation error.
 */
export function packagerSigning({ identity, notaryProfile }: Signing) {
  return {
    osxSign: { identity, continueOnError: false },
    osxNotarize: { keychainProfile: notaryProfile },
  };
}

/** The disk image is downloaded on its own, so it's signed and notarised too. */
export function diskImageSteps(
  { identity, notaryProfile }: Signing,
  dmgPath: string,
): [command: string, args: string[]][] {
  return [
    ['codesign', ['--sign', identity, '--timestamp', dmgPath]],
    [
      'xcrun',
      [
        'notarytool',
        'submit',
        dmgPath,
        '--keychain-profile',
        notaryProfile,
        '--wait',
      ],
    ],
    ['xcrun', ['stapler', 'staple', dmgPath]],
  ];
}
