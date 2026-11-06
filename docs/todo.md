# Splash to-do: from beta to daily driver

Written 4 November 2026 from a read of the code, not a test of the running app.
Items marked **(check)** may already work through Chromium, so test them before
building. Rule from [roadmap.md](roadmap.md) still applies: one phase at a time,
each cleared against [product-quality.md](product-quality.md) before the next.

## Phase A. Switch-blockers (can't use it daily without these)

- [x] Chrome Web Store install, behind a Splash sheet that lists what the extension can reach
- [x] An Extensions page in Settings: on/off, options, store listing, remove, load from a folder
- [x] Check Chrome Web Store downloads against their CRX3 signatures, as Chrome does
- [ ] Password manager support. First results in
      [research/password-managers.md](research/password-managers.md): Bitwarden runs
      up to its sign-in screen, iCloud Passwords can't reach Apple's helper.
  - [ ] Sign in to Bitwarden by hand: autofill, form-field menu, saving a login,
        shortcuts, right-click items, passkeys. The first test window closed by
        itself after about 2.5 minutes with no crash in its log, so this still
        needs a fresh window. Needs your own account.
  - [ ] iCloud Passwords in a Developer ID signed build (does the helper still end?).
        Needs Apple signing.
  - [ ] 1Password (not tested: installing it needs your OK)
  - [x] A native helper that ends at once gets a notice (at most one a minute) instead
        of `EPIPE` logged as an unexpected main-process error. The check for it is unit
        tested; a real helper dying hasn't been run against it yet.
  - [x] `chrome.sidePanel` exists for extensions and opens the panel as a page.
        Toolbar icons sort by name, so a restart no longer swaps them. Both checked
        in a packaged build with two test extensions, loaded in the wrong order on
        purpose. Not yet tried with a real extension that uses a side panel.
- [x] Built-in password save, autofill, generator. A bar offers to save after a sign-in
      (and takes the offer back if the site refused it), Never for This Site, a menu
      under the field that the page can't read or cover, keyboard and mouse, a
      generator on new-password fields, an off switch, and Settings › Passwords with
      reveal, copy, and remove with undo. Checked in the dev app and a packaged build
      against local fake sites with generated values.
  - [ ] By hand: the real Touch ID prompt, and the Keychain prompt on first use. The
        checks skipped Touch ID and used a stand-in for the Keychain. An unsigned
        rebuild may ask for the Keychain again until Splash has a stable signature.
- [x] Saved addresses and cards autofill. Added and removed in Settings, country menus
      mapped, values sealed in the database. Cards only fill on HTTPS or localhost
      after Touch ID. The security code is never saved or filled. Checked with the
      published test card number only.
- [ ] Passkeys / WebAuthn / Touch ID sign-in. Checked: doesn't work. Sites get no
      answer and no prompt appears (GitHub spins). Electron leaves it off, and turning
      it on needs Apple signing. Results and routes in
      [research/passkeys.md](research/passkeys.md).
  - [ ] Passkeys through Bitwarden once signed in (the only route needing no Apple
        signing)
  - [ ] Decide: request Apple's browser entitlement (needs an organization's Account
        Holder), then test whether Electron honours it
  - [ ] Test a real security key, and add a prompt: today nothing asks you to touch it
  - [x] Tell the user when a site's passkey request can't be answered. A notice appears
        when the page asks in response to you, not for a site's silent autofill check.
        The request itself is left alone, so an extension can still answer it.
- [x] Import bookmarks from Chrome and Firefox (and browsers built like them) directly,
      and from any browser's exported bookmarks file. Importing twice adds nothing, and
      undo takes an import back out. Checked with made-up browser profiles.
  - [ ] Safari, by hand. macOS keeps Splash out of Safari's folder without Full Disk
        Access, so Settings says so and points to Safari's own export, which imports
        as a bookmarks file. Reading its files directly is only unit tested.
- [x] Import history from Chrome and Firefox, and saved logins from a passwords CSV file
      (browsers keep theirs encrypted, so an export is the only way in)
- [x] Export bookmarks (HTML), a trail (Markdown) and passwords (CSV: warns first, and
      only you can read the file)
- [x] Private window (separate session, nothing saved). Its own cookies and storage, a
      Private chip, no extensions, external links go to a regular window, it fills
      saved logins but never offers to keep one. Nothing on disk after closing, and the
      next private window starts clean. Checked in the dev app and a packaged build.
- [x] Open File (⌘O), plus files handed over by macOS. Only files the user chose
      can load; a web page can't reach them, and a local page's links only reach
      its own folder or below. Tested with attacks, a restart, a tampered database
      and a deleted file, on Electron with the production file fuse.
  - [ ] Press ⌘O by hand: the native panel itself hasn't been driven
  - [x] Packaged build: macOS's own open-file event works at launch and while running
        (sent with `open -a`, the same event a Finder double-click sends)
  - [ ] Open a file from the Finder by hand
  - [x] Splash is in "Open With" for web pages, PDFs, images, text and media, and
        doesn't take over as the default. Checked by asking macOS, on a build outside
        temp folders (macOS doesn't list apps from those). Your installed build gets
        this at its next rebuild.
  - [x] Palette entry, and dropping a file on the window (on a page or the shell)
  - [x] A local page's `target=_blank` link to a file beside it opens; one outside its
        folder is still refused
- [x] New Window in the File menu (⌘N), on shared trails (see Phase F). Tested
      in the real app with several windows, including quit and restart.
  - [x] Reopen the windows you had open, in the same places, after a restart
  - [ ] A real Dock click after closing every window. What the click triggers is
        tested in the running app: every window closed, then a new one opens, and no
        second one when a window is already open.
- [x] Picture in picture: in a video's context menu, the menu bar and the palette, with
      a site permission. Blocked sites and pages without a video say so.
- [x] Certificate-error page. It already existed; this list was wrong to say it
      was missing. A self-signed certificate is refused and nothing is requested
      (tested). Failed secure connections (ERR*SSL*\*) now get their own message.
  - [x] A deliberate "Continue anyway", for self-signed, expired and wrong-name
        certificates. It covers one site with exactly that certificate, so a different
        one warns again, and the address bar stays "Not secure". Cards aren't offered
        there. Take it back in the site's settings. A private window's choice ends with
        the window. Revoked or malformed certificates get no way past.
  - [x] No way past on sites that insist on valid HTTPS (HSTS), as in Chrome. Electron
        lets you past these, so Splash asks Chromium's own list, with no network traffic.
        Checked in the dev app against a local self-signed server, with
        accounts.google.com pointed at it. Not run in a packaged build yet.
- [x] HTTPS-only mode, on by default, in Settings › Privacy. A page's plain HTTP
      address goes to HTTPS before anything is sent, including links, redirects
      and restored pages. If HTTPS fails, a warning offers "Continue with HTTP",
      remembered per site and revocable in site settings. Local names and bare
      IP addresses aren't changed. Tested in the app against local fake sites
      (no HTTPS, bad certificate, HTTPS redirecting back to HTTP) and example.com.
  - [ ] Try it on real HTTP-only sites (neverssl.com timed out from the test machine)
  - [x] A site that silently drops HTTPS: Splash gives up after 15 seconds and offers
        HTTP (measured 15.1 s against a local server that never answers)
  - [x] An HTTPS address that answers with its own error (404, 500) now offers HTTP,
        and that warning survives switching pages and moving to another window
  - [x] Popup windows from `window.open` try HTTPS first and fall back by themselves,
        with "Not secure" in their title, since a popup has nowhere to ask
  - [x] A site that redirects `http://a` to `http://www.a` asks once

## Phase B. Basic browser things still missing

Address bar and search

- [x] Search shortcuts by keyword (`g query`, `yt query`, `!yt`, `/yt`) and custom search engines
- [x] Waymarks: a bundled list of over 300 search shortcuts to add from Settings
- [x] Paste and Go, Copy as Markdown / plain text
- [x] Choose what a new page shows (a start page with pinned sites / recent pages)
- [x] Homepage setting
- [x] Find bookmarks from the palette and address suggestions, by title or address, in any folder

Bookmarks

- [x] Bookmark manager view (search, rename, move, delete many at once)
- [x] Bookmark a dragged link or URL into a folder
- [x] Bookmark all pages in a branch
- [x] Bookmarks bar toggle (optional; sidebar already holds them)

Pages and windows

- [x] Popup handling. There was no blocker: any script could open pages. Now
      only a click or key press opens one thing; Allow / On click / Block per
      site in site settings; a shield in the address bar and a list of what was
      blocked, each with Open. Sized popups are real windows that keep their
      opener, so sign-in can report back; their title shows the real host.
  - [ ] Try a real "Continue with Google" popup, and ⌘W in a popup, by hand
- [x] Crashed-page screen: tested with real crashes. Says "crashed", "ran out of
      memory" or "was stopped"; Reload keeps the back/forward list.
- [x] Per-site zoom remembered, across restarts and every page of the site; a
      default zoom and a list of zoomed sites in Settings › Pages
- [x] Minimum font size and default fonts in Settings › Pages. They're fixed when
      a view is created, so open pages reload, unless they hold typing or sound.
- [x] Text encoding: nothing to build. Chromium detected undeclared Cyrillic
      correctly whatever the default said, so the setting had no effect and was
      removed. A page declaring the wrong charset can't be overridden: Electron
      has no API for it.
- [x] Move a page between windows: Move to New Window and Move to Window in the
      page menu. Merging needs nothing: every window shows the same trails, so
      closing one loses no pages. Tested through the API, not by clicking the menu.
- [x] Task manager: memory and CPU per process across all windows, End for a page
      (⌘K "task manager", or View › Task Manager)
  - [ ] End a truly hung page by hand (only tested on a responsive one)
- [x] PDF viewing: web and local PDFs display in Chromium's viewer (tested)
- [ ] Save as PDF from Print **(check)**: needs the native dialog, by hand
- [x] Drop a link on a page: opens as a child page, unless a site's drop zone or a
      field takes it (tested with synthetic drags)
  - [ ] Drop a link on the trail to open it. The Bookmarks work owns that hook
        and files links for now; add it there.
  - [ ] Real mouse drags: out of a page to another app, image and text, by hand
- [x] Keep Window on Top, in the View menu, for this session (unit test only)

Privacy and security

- [x] Global Privacy Control / Do Not Track, on by default, in Settings › Privacy:
      `Sec-GPC` and `DNT` on every request, `navigator.globalPrivacyControl` and
      `doNotTrack` in every frame, even under a strict CSP. Not in workers.
- [x] Clear data on quit: history, cookies and site data, cache, download list.
      Runs after the pages are gone, so nothing writes its cookies back. A crash
      or a forced quit is cleaned up at the next launch, before any page loads.
      Open pages stay in their trails, including their back and forward lists.
  - Fixed along the way: clearing "cookies and site data" also wiped uBlock
    Origin's compiled lists; extensions are now left out.
  - Fixed along the way: quitting could leave Splash running with no windows.
- [x] Cookie viewer in Settings › Privacy, grouped by site: delete a site's or a
      single cookie, undo for a minute. Values never reach the renderer. Site
      settings in the address bar show the count and a delete too.
- [x] Block third-party cookies, off by default, with a per-site exception. It
      drops `Cookie` and `Set-Cookie` on requests and hides `document.cookie`
      and `cookieStore` in cross-site frames.
  - [ ] Decide: on by default? Off for now, because there's no Storage Access
        API support, so some embedded sign-ins and players would simply break.
  - [ ] Popups don't run preloads in subframes, so only the headers apply there.
- [x] Per-site JavaScript, images and autoplay, in site settings. JavaScript and
      images follow the page's site and cover what it embeds. Blocking JavaScript
      shows `<noscript>` content and clears the site's service workers.
  - [ ] Autoplay doesn't cover Web Audio (`AudioContext`) or media inside a
        shadow root started by the `autoplay` attribute
  - [ ] Changes apply on reload ("Reload to apply"), not live
- [x] Dangerous-site warning, on by default, using malware-filter's public lists
      (OpenPhish, PhishTank, URLhaus; about 24,000 hosts, refreshed every 12
      hours). Checked on this Mac, so no address is sent anywhere, and nothing
      is requested from the site. "Continue anyway" is remembered per site and
      revocable in Settings. The list source is CC BY-SA 4.0.
  - [ ] Popup windows aren't checked; only a page's own address is
  - [ ] Weaker than Google Safe Browsing: new phishing sites appear later. Its
        free API is non-commercial only, and it would need a paid key to ship.
- [x] Client certificate prompt. **Was a privacy bug:** Electron's default sends
      the first matching certificate without asking. Now a prompt names the site
      and defaults to sending nothing. Tested with fake certificates through the
      real app event; this Mac has no client identity, so it has **not** been
      tried against a real certificate and server.
- [ ] Permissions panel: geolocation, notifications, camera, microphone all
      verified in the installed app
  - [x] All four reach the bar in the packaged app, name the site, and remember
        Block. Usage strings present and the signature valid.
  - [x] Fixed: sites read "denied" before being asked, so a site that checks first
        would say the camera was blocked and never ask. They now read "prompt".
  - [ ] Allow, with a real macOS prompt for each. Needs a person to answer them.
  - [ ] A location refused in macOS shows the page an error, with no explanation
        from Splash, unlike the camera and microphone

Media and macOS

- [x] Media keys, Now Playing / Control Center integration. Works through Chromium,
      with no Splash code.
  - [x] Tested with macOS media commands: play, pause, next and previous reach
        foreground and background pages. Title, artist and album show. Plain audio
        with no media session shows the page title. Audible pages don't sleep.
  - [x] Two pages can play at once; the first isn't paused, as in Chrome.
  - [ ] By hand: the physical keys, and a click in Control Center.
- [x] AirPlay / Cast **(checked)**: not possible on Electron today, which has no
      Media Router. In a page `navigator.presentation` and `PresentationRequest`
      are undefined, `video.remote.prompt()` rejects with `NotAllowedError`, and
      `webkitShowPlaybackTargetPicker` is undefined. macOS's own AirPlay (sound
      output, Screen Mirroring) sits outside Splash; not tried with a receiver.
- [x] Spellcheck language choice in Settings (Pages › Spelling). A language applies
      at the next launch, Off applies at once. Electron's `setSpellCheckerLanguages`
      does nothing on macOS, so this sets the app's own macOS defaults.
  - [ ] "Add to Dictionary" in the misspelling menu
- [x] Dock menu: New Window and recent pages. Clearing history empties the list.
  - [ ] By hand: a real click in the Dock (tested through its click handlers)
- [ ] Handoff / Continuity (later)
- [x] Measured contrast audit and accessibility tree walkthrough: results in
      [accessibility-audit.md](accessibility-audit.md)
  - [x] Palette glass washed out secondary text over a page of the opposite
        brightness (3.13:1 in dark over white). The panel is now 92% opaque.
  - [x] Switch tracks and knobs reach 3:1 on every frame, accent and theme
  - [x] Dark secondary text lifted to `#a89c8f`: placeholders pass on all six frames
  - [ ] Honour macOS "Reduce transparency" and "Increase contrast"
- [ ] VoiceOver walkthrough of the shell. Needs a person: it speaks aloud and takes
      over the Mac

## Phase C. Reliability you still have to prove

- [ ] Hung page: real "isn't responding" bar
- [ ] Camera and microphone prompts on a real call site (Meet, Zoom web)
- [ ] macOS access prompts in the installed app
- [ ] Mouse side buttons and three-finger swipe by hand
- [ ] Real OS mouse drags of trail rows
- [ ] Print and Save Page dialogs by hand
- [ ] Populated downloads, split view, offline recovery, narrow window and
      reduced motion walkthroughs in the packaged app
- [ ] 100+ pages and 10k+ history entries: speed and memory
- [x] Upgrade Electron: now 45.2.3. No 45.0.1 was released; the fix for hanging
      blocking listeners (electron/electron#55234) works here.
- [ ] **Rely on uBlock Origin for blocking, not Splash's own hooks.** Decided 6
      November 2026: the hooks stay for now, but this is where Splash is going.
      Keeping even one hook can't work: Electron runs extension `chrome.webRequest`
      listeners only if the session has no `session.webRequest` listener for any
      event (tested on 45.2.3, one hook at a time: the extension saw nothing).
      So all three hooks go together.
  - [ ] Reported while using Splash: errors on pages, and popups not showing.
        Reproduce each on a site with the hooks on and off to see which come from
        the hooks. Check popups against the popup blocker too.
    - [x] idealo.de's "Something has gone wrong" wasn't the hooks: it answered 403
          to `Splash/1.0.0` in the user agent. Fixed, see User-agent in Phase C.
  - [ ] Cookie filter: move the cookie-notice lists and their network blocking off
        the built-in blocker. uBlock Origin's own cookie lists are stripped in
        `scripts/fetch-extensions.mjs` because some rules click "Accept", and Splash
        must never agree for the user, so decide what replaces them. Hiding rules
        and autoconsent don't use the hooks.
  - [ ] Move the rest off the hooks: dangerous-site warning, HTTPS-only,
        `Sec-GPC`/`DNT`, third-party cookie stripping, per-site script and image
        blocking
  - [ ] Connect to uBlock Origin what's tied to the built-in blocker: the blocked
        count, Block ads, per-site allow, list status
  - [ ] Remove the built-in network blocker and retest YouTube, with a run that has
        no blocker to compare against
  - Tested: a small bundled extension can do the header, cookie, CSP and redirect
    work beside a blocking extension. Its settings would have to be pushed to it,
    since its listeners answer synchronously.
  - YouTube, Electron 45.2.3, signed out, 3 monetised videos, about 30 s each:
    uBlock Origin alone and today's hooks both played with no ad or enforcement
    screen. There was no run without a blocker, so this doesn't show either one
    is what stopped ads. uBlock Origin also blocked one `videoplayback` request
    per video.
  - Difference found: uBlock Origin serves working stand-ins for `gpt.js` and
    `analytics.js`; the built-in blocker's redirects for them fail with
    `ERR_UNSAFE_REDIRECT`, so the page sees a failed script.

## Phase D. Shipping

- [ ] Developer ID signing and notarisation
- [ ] DMG installer
- [ ] arm64 + x64 (universal) build
- [ ] Auto-update
- [ ] Diagnostics: crash reports or exportable log, opt-in
- [ ] First-run welcome that explains trails
- [ ] Default browser prompt at the right moment
- [ ] Privacy statement and licence notice for uBlock Origin (GPL-3.0)

## Phase E. Splash's own gaps

- [x] Redo for trail edits: ⇧⌘Z and a Redo button, for all 10 changes that offer
      Undo (closes of pages, branches, groups and workspaces, moves, pins, renames,
      bookmark changes). ⌘Z and ⇧⌘Z share one history, and something new done
      forgets what could be redone. Redoing a close still asks a page with unsaved
      work first; if it stays, or the pages have gone, the toast says so. In a text
      field both keys edit the text. Tried in the real app through the Edit menu's
      handlers, except renames and drags (unit tests).
  - [x] Press ⌘Z and ⇧⌘Z for real: key presses sent to a test copy from outside it,
        with focus in a page.
  - [x] With focus in a page, both keys reach the trail while a toast offers Undo or
        Redo, and focus stays in the page on screen. Typing in a field on the page
        keeps both keys, as does a focused frame. An empty field doesn't count, since
        many sites focus their search box on load. With no toast, the page gets them.
        Known limit: type, ⌘Z until the field is empty, then ⇧⌘Z goes to the trail, not
        the field, until the toast has gone. Editors drawn on a canvas can't be told
        apart from the page while a toast shows.
- [x] Close Pages Below, in the page menu, the File menu and the palette: closes
      everything after the page in the sidebar, its own children included. Pinned
      pages stay, and a pinned page doesn't offer it. One Undo brings them all back
      and returns to the page that was on screen. Clicked in the real app.
- [x] Recently closed in the History panel, above the day groups, up to 8 rows: a
      page, a branch ("and 2 more"), a group or a workspace. Click or Enter reopens
      that entry, wherever it is in the list; hidden while searching. Tried in the
      real app. Older records have no address, so those rows show no site icon.
- [ ] Resizable split view, then more than two panes
- [x] Contrast check for custom workspace accents: clamped, and all pass (see
      [accessibility-audit.md](accessibility-audit.md))
- [ ] Merge `feat/arc-sidebar` (smart trail rule, filing into saved groups)
- [x] Palette entries for View Source, Developer Tools, Filter Pages, AI panel.
      Each run through the palette in the real app. View Source is offered on web
      pages only.
- [x] Shortcut shown for "Show downloads" in the palette: it already showed ⌥⌘L,
      matching the menu, so this list was out of date. Now covered by a test.
- [ ] Shortcut customisation
- [ ] Page-aware AI: summarise this page, ask about the selection
- [ ] Per-workspace isolated logins
- [ ] Reader mode, page screenshots, reading list, translation
- [ ] Profiles, then cross-device sync, then localisation

## Phase F. Premium-browser features

Collected on 4 November 2026 from what Horse, Arc, Zen, Vivaldi, Brave,
Orion and Safari advertise. "Horse" items come from Horse's own site; marked
**(check)** where Splash may already have part of it. Decisions already made
still apply: no separate tab groups, no horizontal tab bar, say "page".

Trails and projects (Horse parity)

- [x] Shared live trails across windows: every window sees the same trails,
      each with its own page, split view and expand/collapse state. A page shows
      in one window at a time: opening it in a second moves it there, and the
      first says so and offers Show here until the page comes back.
- [ ] Name a top-level trail and give it an emoji
- [ ] Several trails per workspace, with a clear "trailhead" (a top-level
      page) in the UI
- [ ] Create a sibling ("sidetrail") as well as a child ("subtrail"), each on its own shortcut
- [ ] Collapse everything except the current trail (one shortcut)
- [ ] Select the trail above/below and collapse/expand by ⌘⇧ arrows **(check)**
      against the existing ↑ ↓ ← → navigation
- [ ] Drag a trail out of the sidebar to export it as Markdown: pages in order,
      links clickable, notes beside their page, folders nested
- [ ] Import / paste a Markdown outline back into a trail
- [ ] Come-back summary: on reopening, show where you left each trail
- [ ] Cross-device trail sync (the question Horse's FAQ expects)

Arc / Zen style

- [ ] Peek / Glance: preview a link in an overlay without opening a page
- [ ] Little window: open an outside link in a small window, then keep or drop it
- [ ] Link routing rules: links from an app or domain open in a chosen workspace
- [ ] Auto-archive pages untouched for N days, with a way to find them again
- [ ] Boosts: per-site CSS/JS tweaks, dark mode per site, element zapper
- [ ] Auto-hide / compact sidebar with a hover reveal
- [ ] Essentials: always-on pinned sites shared by every workspace
- [ ] Page-aware notes and a scratchpad per workspace
- [ ] Sidebar web panels (chat, music, calendar) beside the trail
- [ ] Automatic picture in picture when switching away from a video
- [ ] Hover cards: page title, URL, preview (partly done: row preview)
- [ ] Per-site appearance (tab colour from the site, or a chosen one)

Vivaldi style power features

- [ ] Mouse gestures and custom keyboard shortcuts
- [ ] Quick commands for everything (palette covers most; close the gap)
- [ ] Session snapshots: save and restore a set of pages by name
- [ ] Tab (page) search across titles, URLs and page text
- [ ] Notes with screenshots and links; capture a page region
- [ ] Rich history view: a timeline, per-day, grouped by trail
- [ ] Download manager with categories and a progress popover

Brave / privacy style

- [ ] Per-site shields panel (what was blocked, toggles)
- [ ] Block fingerprinting, tracking parameters stripped from URLs (utm\_\*, fbclid)
- [ ] Bounce-tracking protection and storage partitioning
- [ ] Tor / VPN private window (optional, later)
- [ ] Built-in DNS over HTTPS with a provider choice
- [ ] Block scripts, social widgets and trackers by category

Safari / Orion style polish

- [ ] Hide My Email / Sign in with Apple helpers, iCloud Keychain handoff
- [ ] Share to Reminders, Notes, Messages (native share exists)
- [ ] Reader mode with themes, and text-to-speech
- [ ] Translation of the page, offered on the right languages only
- [ ] Per-site settings sheet for zoom, camera, auto-play, content blockers
- [ ] Web inspector / developer tools tuned for the trail

Media and compatibility

- [ ] DRM video (Widevine): Electron doesn't ship the Widevine CDM, so Netflix,
      Disney+ and Spotify web may not play. Research in
      docs/research/how-to-build-a-good-browser.md
- [x] Hardware media keys and Now Playing: see Media and macOS in Phase B
- [ ] Chrome compatibility pass: Google Docs, Figma, Meet, Zoom, Notion,
      banking sites, Netflix
- [ ] User-agent and client-hints strategy so sites don't treat Splash as unsupported
  - [x] Pages get Chrome's user agent, without `Splash/` and `Electron/`, in pages,
        frames and workers. idealo.de answered 403 before.
  - [ ] Client hints: `navigator.userAgentData` lists `Chromium` but no
        `Google Chrome`. Check whether any site refuses that.
- [ ] Memory footprint comparison with Chrome, published honestly

Product and business (decide, don't just build)

- [ ] Free trial, pricing and licence model (Horse: 14 days, $70/year; GPL-3.0
      constraints from electron-chrome-extensions apply)
- [ ] Student / regional pricing, lifetime licence, refund terms
- [ ] A site that explains trails in four steps and a FAQ
- [ ] A privacy answer: "can Splash see what I browse?" (it can't; say so plainly)
- [ ] Which Macs are supported (Apple silicon, Intel, macOS versions)
- [ ] Windows and Linux plan, or an explicit "macOS only"
- [ ] ADHD / working-memory positioning, if you want it (Horse does; be careful with health claims)
- [ ] Reviews and a community channel

## Housekeeping

- [ ] Commit the palette Tab switch
- [ ] Bring `docs/roadmap.md` up to date (leave-site protection is done)
- [ ] Split `TrailTree.tsx`, `browser-controller.ts` and `app.css`
- [ ] Point `.claude/launch.json` away from the old prototype worktree
- [ ] Decide what to do with `sites/` and `prototype-02-shell`
