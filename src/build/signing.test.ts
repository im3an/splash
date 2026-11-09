import { diskImageSteps, packagerSigning, signingFrom } from './signing';

const IDENTITY = 'Developer ID Application: Example Developer (AB12CD34EF)';

describe('which signature a build gets', () => {
  it('stays ad hoc with nothing set, as today', () => {
    expect(signingFrom({})).toBeNull();
    expect(
      signingFrom({ SPLASH_SIGNING_IDENTITY: ' ', SPLASH_NOTARY_PROFILE: '' }),
    ).toBeNull();
  });

  it('uses the Developer ID and the notary profile when both are set', () => {
    expect(
      signingFrom({
        SPLASH_SIGNING_IDENTITY: IDENTITY,
        SPLASH_NOTARY_PROFILE: 'splash-notary',
      }),
    ).toEqual({ identity: IDENTITY, notaryProfile: 'splash-notary' });
  });

  it('stops when only one is set, rather than ship a half-signed build', () => {
    expect(() => signingFrom({ SPLASH_SIGNING_IDENTITY: IDENTITY })).toThrow(
      /SPLASH_NOTARY_PROFILE/,
    );
    expect(() =>
      signingFrom({ SPLASH_NOTARY_PROFILE: 'splash-notary' }),
    ).toThrow(/SPLASH_SIGNING_IDENTITY/);
  });

  it('stops on a certificate that isn’t for apps outside the App Store', () => {
    expect(() =>
      signingFrom({
        SPLASH_SIGNING_IDENTITY:
          'Apple Development: Example Developer (AB12CD34EF)',
        SPLASH_NOTARY_PROFILE: 'splash-notary',
      }),
    ).toThrow(/Developer ID Application/);
  });
});

describe('a Developer ID build', () => {
  const signing = { identity: IDENTITY, notaryProfile: 'splash-notary' };

  it('signs the app and has Apple notarise it, with no secret in the config', () => {
    expect(packagerSigning(signing)).toEqual({
      // Packager otherwise turns a failed signature into a warning and goes on.
      osxSign: { identity: IDENTITY, continueOnError: false },
      osxNotarize: { keychainProfile: 'splash-notary' },
    });
  });

  it('signs, notarises and staples the disk image too', () => {
    expect(diskImageSteps(signing, '/out/Splash.dmg')).toEqual([
      ['codesign', ['--sign', IDENTITY, '--timestamp', '/out/Splash.dmg']],
      [
        'xcrun',
        [
          'notarytool',
          'submit',
          '/out/Splash.dmg',
          '--keychain-profile',
          'splash-notary',
          '--wait',
        ],
      ],
      ['xcrun', ['stapler', 'staple', '/out/Splash.dmg']],
    ]);
  });
});
