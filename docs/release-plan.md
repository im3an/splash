# Release plan: 9 November 2026

When Splash can go to testers, when it can go to the public, and how installed
copies get updates. Details of each open item are in [todo.md](todo.md); what
the beta contains is in [beta-readiness.md](beta-readiness.md). The step-by-step
checklist, with who does what, is [deploy-todo.md](deploy-todo.md).

## Where Splash stands

- The features of a daily browser are in, and `npm run check` passes. Trails,
  workspaces, history, downloads, passwords and autofill, bookmark import,
  private windows, extensions, uBlock Origin and the privacy controls all work.
- **It's ready for a closed beta now**, with a handful of testers who can use
  Terminal: the build is signed ad hoc, so installing takes a `ditto` command
  (see beta-readiness.md), and every new build has to be installed by hand.
- **It isn't ready for the public.** That needs Apple signing first, and
  updates depend on it too.

## Gate 1: closed beta (now)

For 5 to 20 people you know. Nothing here needs a purchase.

- [ ] Version beta builds as `1.0.0-beta.N`, as the existing `v1.0.0-beta.1`
      tag does, not `1.0.0`: updates compare versions, so the public 1.0 has
      to count as newer than every beta.
- [ ] A short note for testers: how to install, what doesn't work yet (see
      "Known limits" below), and how to report a problem with Settings › About ›
      Save Report…
- [ ] One place for reports: an email address, a form or a chat group.
- [ ] Build each beta from a tagged commit, so a report can be matched to its
      code.

Leave the closed beta when testers have used Splash daily for two weeks with no
lost pages, settings or passwords, and no open crash that repeats.

## Gate 2: public beta (needs Apple signing)

Anyone can download it from a page. These need you:

- [ ] **Join the Apple Developer Program** (99 USD a year) **as an individual**,
      decided 9 November 2026. Passkeys through Apple's browser entitlement are
      then out of reach: only an organisation can ask for it. Bitwarden's passkeys
      stay the route.
- [ ] **Decide whether the repository goes public.** Splash is GPL-3.0, so
      everyone who gets the app must be able to get its source. A public repo
      settles that, and it also allows the simplest update service (see below).
- [ ] **Decide about Intel Macs:** a universal build, or "Apple silicon only" on
      the download page.

Then this is the work, about one to two days once the certificate exists:

- [x] Developer ID signing and notarisation, prepared 9 November 2026:
      `src/build/signing.ts` and `forge.config.mts` switch them on when both
      variables below are set. The app and the disk image are signed,
      notarised and stapled; credentials stay in the keychain, never the repo.
      Checked by packaging three ways: with nothing set, the build is ad hoc
      as before and passes `codesign --verify --deep --strict`. A made-up
      certificate stops at signing ("No identity found for signing."). A half
      setup stops before building. Not yet run with a real certificate.
- [ ] Updates, as described below, including Check for Updates in Settings ›
      About.
- [ ] A release script: build, sign, notarise, publish, in one command.
- [ ] A download page with the privacy statement, known limits and a way to
      reach you.
- [ ] Prove it end to end: a signed build installs by dragging on a Mac that
      never saw Splash, then updates itself to the next build.
- [ ] Do the checks only a person can do once, on the signed build: camera and
      microphone on a real call, Touch ID and Keychain prompts, real mouse
      drags, Print, a VoiceOver pass.

### Steps for you: from enrolment to a signed build

Only you can do these: they need your Apple ID, payment and passwords.

1. Enrol at developer.apple.com/programs/enroll **as an individual**, with an
   Apple ID that has two-factor authentication. It costs 99 USD a year, and
   Apple can take a day or two to confirm.
2. Make a **Developer ID Application** certificate: Xcode › Settings ›
   Accounts › your team › Manage Certificates › + › Developer ID Application.
   Check that it's there:

   ```bash
   security find-identity -v -p codesigning
   ```

   It shows `Developer ID Application: Your Name (TEAMID)`. Note the whole
   name and the team ID in brackets.

3. Make an app-specific password at account.apple.com (Sign-In and Security ›
   App-Specific Passwords), then save it for notarisation. The command asks
   for the password, so type it yourself:

   ```bash
   xcrun notarytool store-credentials splash-notary --apple-id <your Apple ID> --team-id <TEAMID>
   ```

4. Build signed:

   ```bash
   SPLASH_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)" SPLASH_NOTARY_PROFILE=splash-notary npm run make
   ```

   Notarisation uploads the app to Apple and waits, usually a few minutes.
   Without the two variables, `npm run make` builds ad hoc as before.

## Gate 3: public 1.0

- [ ] The public beta has run for about four weeks, and at least two updates
      reached people's Macs without trouble.
- [ ] No open bug that loses data or weakens security.
- [ ] Blocking settled: the built-in blocker or uBlock Origin alone (todo.md,
      "Rely on uBlock Origin").
- [ ] Pricing and licence decided, if Splash will cost money.

## Updates

### How they work

Electron's `autoUpdater` uses Squirrel.Mac. The app asks a feed whether there's
a newer version, downloads its zip in the background, checks that it's signed
by the same Developer ID, and installs it when Splash restarts.

- **No updates before Developer ID signing.** Forge's documentation calls a
  signed app "a pre-requisite for using auto updates on macOS". Ad-hoc beta
  builds can't update themselves, so testers install the first signed build
  by hand once.
- What updates carry: the app, Electron (so Chromium security fixes) and the
  bundled uBlock Origin. Filter and safety lists already update themselves
  without an app update.

### Where updates come from

1. **update.electronjs.org**: free, run by the Electron team. It needs a public
   GitHub repository, builds on GitHub Releases, and code-signed builds. The
   code is the `update-electron-app` module plus Forge's GitHub publisher.
   **Recommended if the repo goes public**: nothing to host.
2. **Static storage**: S3, Cloudflare R2 or any file host. Forge's zip maker
   writes a `releases.json` (`macUpdateManifestBaseUrl`), Forge's S3 publisher
   uploads it with the zips, and `update-electron-app` reads it. It costs cents
   a month. **Recommended if the repo stays private.**
3. **Your own update server** (Hazel, Nuts, electron-release-server): beta and
   stable channels, and rolling out to a share of users first. Worth it later,
   with many users.

Sources: Electron, "Updating Applications"
(electronjs.org/docs/latest/tutorial/updates); Electron Forge, "Auto Update"
(electronforge.io/advanced/auto-update).

### How it should feel in Splash

- Check at launch and every few hours, and download quietly.
- When an update is ready: a toast, "Splash 0.9.2 is ready. Restart to update",
  with Restart and Later. Never restart on its own, since restarting brings
  back trails but not what was typed into a page.
- Settings › About: the version, Check for Updates, and what changed.
- A failed check says so in About, never as a pop-up.
- Later: a beta channel that testers can switch on.

## Known limits to say out loud

- Passkeys don't work yet. Splash says so when a site asks; Bitwarden may
  cover it.
- Netflix, Disney+ and Spotify web may not play: Electron has no Widevine.
- No sync between Macs.
- Apple silicon only, unless a universal build is made.

## Decisions waiting for you

1. ~~Apple Developer Program, as an individual or as an organisation.~~
   As an individual (9 November).
2. Repository public or private: this picks the update service.
3. Intel Macs: build for them, or not.
4. Where testers report problems.
