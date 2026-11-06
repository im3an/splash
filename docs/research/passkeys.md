# Passkeys, WebAuthn and Touch ID in Splash

Tested 6 November 2026 on Electron 45.0.0, in a throwaway dev build of Splash and in a
minimal unsigned Electron app, against a local test page. Not tested: a real security
key, a real Touch ID prompt, a Developer ID signed build, and Apple's browser
entitlement. Those need hardware or an Apple account.

## Summary

- **Passkey sign-in doesn't work in Splash today.** Touch ID, iCloud Keychain and
  system passkey providers are all off, because Electron leaves them off until the app
  calls `app.configureWebAuthn`, and Splash doesn't.
- **The browser itself shows no prompt.** A request that asked for a 6 s timeout failed
  only after 180 s (measured once). GitHub shows "partial passkey support" and a spinner
  in that time. Since 6 November 2026 Splash shows a notice when a page asks in response
  to the user, and leaves the request running so an extension can still answer it. A
  site's silent autofill check gets no notice.
- **Calling `configureWebAuthn` isn't enough.** Each mode also needs Apple signing that
  Splash doesn't have (it's ad-hoc signed, with no entitlements or provisioning profile).
- **Passkeys you already have are the hard part.** Electron's Touch ID mode can only use
  passkeys created in Splash. Reaching iCloud Keychain on any site probably takes Apple's
  browser entitlement, which Apple grants on request.

## What happens today

Splash dev build, `http://localhost` test page, no authenticator set up.

| Check                                             | Result                                       |
| ------------------------------------------------- | -------------------------------------------- |
| `navigator.credentials`, `PublicKeyCredential`    | Present                                      |
| `isUserVerifyingPlatformAuthenticatorAvailable()` | `false`                                      |
| `isConditionalMediationAvailable()`               | `true`, which is misleading: nothing answers |
| `create()`, platform, 6 s timeout                 | No answer after 14 s, no UI                  |
| `create()`, security key, 6 s timeout             | No answer after 14 s, no UI                  |
| `get()`, 6 s timeout                              | `NotAllowedError` after 180 s, no UI         |
| `get()` with `mediation: 'conditional'`           | No answer before the page aborted it at 4 s  |

## The plumbing works

With a Chromium virtual authenticator attached over CDP (USB, CTAP2, in the same build):

| Check                    | Result                                          |
| ------------------------ | ----------------------------------------------- |
| `create()`               | Succeeds in 10 ms                               |
| `get()` by credential ID | Succeeds in 2 ms                                |
| `get()` with no ID given | `NotAllowedError`, no `select-webauthn-account` |

So Splash's permission handlers aren't blocking anything, and no code in Splash needs
fixing for requests to reach an authenticator. The last row matters: without a
`select-webauthn-account` listener, discoverable sign-in (the usual passkey flow) is
cancelled even with one matching credential. Electron's docs say the same.

## What `configureWebAuthn` does without signing

Minimal Electron app, same version, unsigned, on the same test page.

| Mode               | Platform check | `create()` and `get()`                                              |
| ------------------ | -------------- | ------------------------------------------------------------------- |
| `touchID`          | `false`        | No answer after 14 s; logs that the keychain entitlement is missing |
| `platformPasskeys` | `true`         | `NotAllowedError` within 20 ms, `ASAuthorizationError` 1004         |
| Both               | `true`         | Same as `platformPasskeys`                                          |

`platformPasskeys` on its own would make things worse: it tells sites passkeys are
available and then refuses every request. A localhost page can't succeed in this mode
even when signed, so this result doesn't show how a signed build behaves on a real site.

## Ways to get there

| Route                       | Reaches                                        | Needs                                                                                                                             |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Password manager extension  | Passkeys stored in that manager                | A signed-in vault. Bitwarden replaces the page's WebAuthn calls itself; unproven here, tracked under Password manager             |
| Electron `touchID`          | New device-only passkeys, created in Splash    | `keychain-access-groups` entitlement, a provisioning profile, and an account picker for `select-webauthn-account`                 |
| Electron `platformPasskeys` | Only sites that list Splash in their AASA file | Associated Domains, a provisioning profile. No general website lists Splash, so this alone can't serve a browser                  |
| Apple's browser entitlement | Passkeys for any site, in principle            | Apple's approval, requested by the Account Holder of an organization's developer account. Whether Electron honours it is untested |
| Security key                | Keys without a PIN                             | A sign-in UI: today nothing tells the user to touch the key. Electron cancels requests that need a PIN (issue 24573)              |

Open points on the entitlement route:

- `com.apple.developer.web-browser.public-key-credential` lets a browser make requests
  "for any relying party identifier". The Electron binary contains Chromium's iCloud
  Keychain code, but its docs describe only the associated-domain path.
- Electron's docs say a platform passkey reports `https://<rpId>` as its origin, not the
  page's. A site that signs in on a subdomain and checks origins strictly could reject it.
- Electron's platform passkeys can't serve iframes, and don't support `prf` or `largeBlob`.

Sources: `node_modules/electron/electron.d.ts` (`app.configureWebAuthn`,
`select-webauthn-account`), and Apple's
[entitlement page](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential).
