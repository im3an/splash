# Deployment to-do

Everything between today's build and Splash on strangers' Macs, in order.
**You** marks steps that need your account, money, password or decision.
**Claude** marks steps an agent can do. Why each stage exists is in
[release-plan.md](release-plan.md).

## Stage 1: next closed-beta build (nothing to buy)

- [ ] **You:** say "commit". Much of the work since `v1.0.0-beta.1` isn't
      committed yet, and a beta should be built from a tagged commit.
- [x] **Claude:** set the version to `1.0.0-beta.2` (done 9 November). `v1.0.0-beta.1` is already
      tagged, but `package.json` says `1.0.0`, which would count as newer
      than every later beta and block updates to them.
- [ ] **You:** pick one place for reports: an email address, a form or a chat
      group.
- [ ] **Claude:** write the tester note: install with `ditto`, the known limits,
      and how to send Settings › About › Save Report… to that place.
- [ ] **You:** set up the beta sign-up sheet (about 5 minutes,
      `sites/beta-signups/README.md`) and paste its URL into
      `sites/splash-site/beta.js`.
- [ ] **You:** decide where the website (`sites/splash-site`) is hosted, and on
      which domain.
- [ ] **Claude:** tag `v1.0.0-beta.2` and build the DMG from a clean copy of
      that tag (`npm run make`). Then install it on a throwaway profile and
      check that it starts.
- [ ] **You:** send testers the DMG and the note.

Leave Stage 1 when testers have used Splash daily for two weeks with no lost
pages, settings or passwords, and no crash that repeats.

## Stage 2: Apple signing (you first)

- [ ] **You:** join the Apple Developer Program as an individual (99 USD a
      year).
- [ ] **You:** make the "Developer ID Application" certificate and the
      `splash-notary` profile. The commands are in release-plan.md, "Steps for
      you".
- [x] **Claude:** signing and notarisation are wired into the build and switch
      on from two environment variables (done 9 November 2026).
- [ ] **Claude:** first signed build. Check that Gatekeeper accepts it
      (`spctl -a -vvv`), and that Splash starts, uBlock Origin blocks, and
      passwords and the camera prompt work under the hardened runtime.
- [ ] **You:** open the signed DMG on a Mac that never had Splash, and drag it
      to Applications. It must open without any warning.

## Stage 3: updates

- [ ] **You:** repository public or private. Splash is GPL-3.0, so a private
      repo still needs a way to hand out the source. - Public: updates come free from update.electronjs.org via GitHub
      Releases. - Private: updates come from your own storage (Cloudflare R2 or S3, cents a
      month).
- [ ] **You (private only):** create the bucket and an access key, and put the
      key in your keychain or shell, never in the repo.
- [ ] **Claude:** wire `update-electron-app` and a Forge publisher for the
      chosen source.
- [ ] **Claude:** Settings › About gets the version, Check for Updates and what
      changed. Add a "Restart to update" toast with Later, and never restart
      on its own.
- [ ] **Claude:** a release script, `npm run release:mac`, that runs checks,
      builds, signs, notarises and publishes in one command.
- [ ] **Claude + You:** prove it: install release N, publish N+1, and Splash
      updates itself.

## Stage 4: public beta

- [ ] **You:** Intel Macs: a universal build, or "Apple silicon only" on the
      page.
- [ ] **Claude:** download page on the website. It needs the DMG link,
      version, system requirements, known limits, privacy statement, source
      link and a contact.
- [ ] **You:** put the website live on your domain.
- [ ] **You:** the checks only a person can do, once on the signed build: a
      real video call (camera, microphone), Touch ID and Keychain prompts,
      dragging pages with a real mouse, Print, and a VoiceOver pass.
- [ ] **You:** announce it.

## Stage 5: 1.0

- [ ] About four weeks of public beta, with at least two updates that
      arrived without trouble.
- [ ] No open bug that loses data or weakens security.
- [ ] **You:** blocking settled: the built-in blocker, or uBlock Origin alone.
- [ ] **You:** price and licence, if Splash will cost money.
- [ ] **Claude:** version `1.0.0`, release, and the website says 1.0.

## Every release, once Stage 3 is done

1. `npm run check` passes.
2. Raise the version (`1.0.0-beta.N`, later `1.0.N`) and write what changed.
3. Commit, then tag `v<version>`.
4. `npm run release:mac`.
5. Install the published build over the previous one and check that it updates
   and starts.
