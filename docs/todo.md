# Splash to-do: from beta to daily driver

Written 4 November 2026 from a read of the code, not a test of the running app.
Items marked **(check)** may already work through Chromium, so test them before
building. Rule from [roadmap.md](roadmap.md) still applies: one phase at a time,
each cleared against [product-quality.md](product-quality.md) before the next.

## Phase A. Switch-blockers (can't use it daily without these)

- [ ] Chrome Web Store install (unpacked extensions only today)
- [ ] Password manager support: test 1Password, Bitwarden, iCloud Passwords extensions **(check)**
- [ ] Built-in password save, autofill, generator (after the extension test)
- [ ] Saved addresses and cards autofill
- [ ] Passkeys / WebAuthn / Touch ID sign-in **(check)**, no code mentions it
- [ ] Import bookmarks from Chrome, Safari, Firefox
- [ ] Import history and saved logins
- [ ] Export bookmarks (HTML) and a trail
- [ ] Private window (separate session, nothing saved)
- [x] Open File (⌘O), plus files handed over by macOS. Only files the user chose
      can load; a web page can't reach them, and a local page's links only reach
      its own folder or below. Tested with attacks, a restart, a tampered database
      and a deleted file, on Electron with the production file fuse.
  - [ ] Press ⌘O by hand: the native panel itself hasn't been driven
  - [ ] Test on a real packaged build, and from the Finder
  - [ ] List Splash in Finder's "Open With" (document types in Info.plist)
  - [ ] Palette entry, and dropping a file on the window
  - [ ] A local page's `target=_blank` link to a file does nothing, silently
- [ ] New Window in the File menu. **Not a small item:** each window restores
      the whole session and saves it back on its own, so two windows would
      overwrite each other's trails (read in the code, not reproduced). Needs
      shared trails first (see Phase F).
- [ ] Picture in picture: context menu on video, site permission
- [x] Certificate-error page. It already existed; this list was wrong to say it
      was missing. A self-signed certificate is refused and nothing is requested
      (tested). Failed secure connections (ERR*SSL*\*) now get their own message.
  - [ ] Decide: a deliberate "Proceed anyway". Today there is no bypass, which is
        the safest choice but blocks self-signed sites, including local dev ones.
- [ ] HTTPS-only mode (upgrade, warn before plain HTTP). Plain HTTP already shows
      "Not secure", and typed addresses already default to HTTPS. Note: a redirect
      or link to HTTP isn't upgraded.

## Phase B. Basic browser things still missing

Address bar and search

- [ ] Search shortcuts by keyword (`g query`, `yt query`) and custom search engines
- [ ] Paste and Go, Copy as Markdown / plain text
- [ ] Choose what a new page shows (a start page with pinned sites / recent pages)
- [ ] Homepage setting

Bookmarks

- [ ] Bookmark manager view (search, rename, move, delete many at once)
- [ ] Bookmark a dragged link or URL into a folder
- [ ] Bookmark all pages in a branch
- [ ] Bookmarks bar toggle (optional; sidebar already holds them)

Pages and windows

- [ ] Popup handling: allow/block per site, indicator in the address bar **(check)**
- [ ] Crashed-page screen: "This page stopped working" exists in the code and has
      a unit test. Trigger a real crash once to see it.
- [ ] Per-site zoom remembered, and a default zoom in Settings
- [ ] Minimum font size and default font settings
- [ ] Text encoding
- [ ] Merge / move a page between windows
- [ ] Task manager: memory and CPU per page, end an unresponsive page
- [x] PDF viewing: web and local PDFs display in Chromium's viewer (tested)
- [ ] Save as PDF from Print **(check)**
- [ ] Drag a link, image or text into the sidebar or a page and out of it **(check)**
- [ ] Always-on-top / picture-in-window option (low priority)

Privacy and security

- [ ] Global Privacy Control / Do Not Track signal (not present in code)
- [ ] Clear data on quit
- [ ] Cookie viewer / per-site cookie delete
- [ ] Block third-party cookies option
- [ ] Per-site content settings: JavaScript, images, autoplay
- [ ] Safe browsing / known-bad-site warning (no equivalent in code)
- [ ] Client certificate prompt **(check)**
- [ ] Permissions panel: geolocation, notifications, camera, microphone all
      verified in the installed app

Media and macOS

- [ ] Media keys, Now Playing / Control Center integration
- [ ] AirPlay / Cast **(check)**
- [ ] Spellcheck language choice in Settings
- [ ] Dock menu: New Window, recent pages (only basic dock code exists)
- [ ] Handoff / Continuity (later)
- [ ] VoiceOver walkthrough of the shell, and a measured contrast audit

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
- [ ] Upgrade Electron to 45.0.1+, move network blocking to uBlock Origin,
      retire the built-in hooks, retest YouTube

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

- [ ] Redo for trail edits
- [ ] Close pages below
- [ ] Recently closed list outside the History menu
- [ ] Resizable split view, then more than two panes
- [ ] Contrast check for custom workspace accents
- [ ] Merge `feat/arc-sidebar` (smart trail rule, filing into saved groups)
- [ ] Palette entries for View Source, Developer Tools, Filter Pages, AI panel
- [ ] Shortcut shown for "Show downloads" in the palette
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

- [ ] Shared live trails across windows: every window sees the same trails,
      each with its own page open and its own expand/collapse state
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
- [ ] Hardware media keys and Now Playing
- [ ] Chrome compatibility pass: Google Docs, Figma, Meet, Zoom, Notion,
      banking sites, Netflix
- [ ] User-agent and client-hints strategy so sites don't treat Splash as unsupported
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
