# Splash roadmap

One verified phase at a time. Every phase clears the gate in
[product-quality.md](product-quality.md) before the next one starts. Features
from the brainstorm are sorted into the phase where they belong. Anything not
listed under a phase waits.

## Done

- **01 Foundation.** Shell window, sidebar, address bar, page host.
- **02 Browsing engine.** Link clicks branch the trail; view lifecycle.
- **03 Tree interaction.** Drag and drop, context menus, close branch, undo.
- **04 Persistence and workspaces.** SQLite store with migrations; sessions,
  workspaces, history, notes and undo survive restarts; create, rename,
  reorder, delete (undoable) and switch workspaces; safe startup when the
  database is newer, corrupt or locked; failed saves are shown and quitting
  with unsaved changes asks first.
- **05 Premium interaction pass.** Audio and mute on trail rows; site settings
  popover; permission prompts remembered per site with a blocked indicator;
  specific error pages with Retry; find and zoom; rename and notes; command
  palette and address suggestions; workspace personalisation (icon, accent,
  frame, light/dark).
- **06 Beta hardening.** Settings window (General, Appearance, Workspaces,
  Privacy, Downloads, Shortcuts, Advanced); downloads with row progress,
  failure reasons, retry, show in Finder and unsafe-file warnings; clear
  browsing data with undo for history; visible asleep pages; unresponsive-page
  bar; default browser and web links from other apps.

- **Compare related pages.** Split view shows two pages of a workspace side
  by side, the ancestor on the left. ⌘\\, the toolbar button, the page menu
  (Compare with Parent/Child, Open in Split View) or the palette open it.
  Clicking a side makes it active; links from either side open on the right.
  The pair stays while other pages are shown, comes back with either page,
  ends when one closes or moves, and survives a restart.
- **Command palette and pinned pages.** ⌘K groups results under Pinned,
  Pages, Workspaces, Commands and History; the section with the best match
  leads, matched words are marked and the footer says what ↵ will do. It
  switches workspaces (with their ⌃1–9 shortcuts), and `>` narrows it to
  commands, which hide when they can't apply and name what a toggle will do
  ("Unpin page"). Pinned pages are Splash's saved pages: ⌘D, the page menu or
  the palette pins a page to the top of its trail with a pin on its row;
  closing one puts it to sleep and offers "Unpin and close"; pins confirm
  with Undo and survive a restart.

- **Browser essentials for beta.** A site's full screen (a video) fills the
  whole window and gives it back on Esc, even from a split view. ⌘P prints,
  ⇧⌘C copies the page address with a confirmation, ⇧⌘R reloads ignoring the
  cache. ⌃⇥ and ⌃⇧⇥ step through the trail's visible rows, ⌘1–⌘8 pick a
  row and ⌘9 the last. A mouse's back and forward buttons and a three-finger
  swipe go back and forward. ⌥⌘L opens and closes Downloads. The History
  menu lists recently closed pages (any of them can be reopened, not only the
  last) and recently visited pages. The window takes the active page's title
  for the Window menu and Mission Control. In pages, the right-click menu adds
  Download Linked File, Download Image, Look Up and Print.
- **Fixes found while testing.** uBlock Origin's scriptlets injected by the
  built-in blocker no longer overwrite each other's helpers: on YouTube that
  made `Function.prototype.toString` and `fetch.toString()` overflow the
  stack. Closing or putting a page to sleep no longer starts a loop between
  Splash and the extensions library that leaked hundreds of empty page views.

- **Warm dark beta (2 November).** The Ripple mark and app icon; warm
  charcoal dark by default; one token-based design system with a guard test;
  links for other apps ask first; ⌘Z undoes trail edits; ⌥⌘F filters the
  trail; ⌥⌘arrows move pages; drag a page onto a workspace; Close Other
  Pages; more of the browser in the palette; a startup choice; database
  backup before upgrades; typed form data kept off disk; the shell served from
  `app://splash`. See [beta-readiness.md](beta-readiness.md).

## Open before beta

- Picture in picture as a site permission: Chromium doesn't expose it, so it
  isn't in site settings yet.
- Verify the hang ("isn't responding") bar with a real hung page; it couldn't
  be triggered from automation.
- Verify camera and microphone prompts with a real call site, and the macOS
  access prompts in the installed app.
- Code signing and notarisation for distribution.

### Gaps from the 25 October audit

The whole product was read against [product-quality.md](product-quality.md).
It was checked in the code, not yet in the running app. Ordered by impact on
the user:

1. ~~**Feedback disappears with the sidebar.**~~ Done: while the sidebar is
   hidden, the toast and the downloads button sit in the toolbar.
2. ~~**Collapsed branches hide state.**~~ Done: a collapsed row shows how many
   pages it hides, and any sound (click to mute), download or failure (click
   to show the page) among them.
3. ~~**Silent actions.**~~ Done: Copy Link, Copy Image and Copy Image Address
   are confirmed; Move to Workspace says where the branch went, with Go there
   and Undo.
4. ~~**The trail can't be walked from the keyboard.**~~ Done: ↑ ↓ step
   through rows without opening them, ← → go to the parent or first child
   (collapsing and expanding first), Home and End jump to the ends, Enter
   opens and F2 renames. Tab returns to the row last focused. ⌥⌘arrows move
   the focused page up, down, in and out.
5. ~~**Undo is partial.**~~ Done: every trail change that offers Undo in its
   toast can also be undone with ⌘Z and redone with ⇧⌘Z, from a page too while
   the toast shows.
6. ~~**Offline doesn't recover.**~~ Done: "You're offline" pages reload by
   themselves once the Mac is back online.
7. ~~**Menus don't reflect state.**~~ Done: Back, Forward, Close Branch,
   Print and Copy Page Address are disabled when they can't apply.
8. ~~**Downloads are hard to reach.**~~ Done: View › Downloads (⌥⌘L) opens
   the list at any time, and the palette's "Show downloads" shows the shortcut.
9. ~~**History can only be reached by search.**~~ Done: History › Show All
   History (⌘Y), the palette and the sidebar's foot show History in the
   sidebar, widened, in place of the trail: search, reopen or remove sites,
   with undo. Downloads opens there the same way.

### Browser basics still missing

Found in the 25 October feature check. Unsaved-form protection is a release blocker:

- **HTTP authentication — implemented.** A page-owned native sign-in window identifies the requesting server, masks the password, cancels on navigation or page close, and keeps credentials out of saved state. Verified against a local protected server in the packaged app.
- **"Leave site?" on close.** Closing a page with unsaved form input closes
  it at once. Reopen Closed brings the address back, not what was typed.
- **Save Page As and View Source — implemented.** ⇧⌘S saves a single-file web archive, with retry and completion feedback. ⌥⌘U opens web source as a child page. Both were exercised in the packaged app.
- **Open File — implemented.** ⌘O, or a file handed over by macOS, opens web pages, PDFs, images, text, audio and video as new pages. Only files the user chose can load, kept in a saved list so they return after a restart; Clear History forgets those no longer on a page. Not yet exercised in a packaged build.
- **HTTPS-only mode — implemented.** On by default. Public sites go to HTTPS before anything is sent; if that fails, a warning offers Continue with HTTP, remembered per site and revocable in site settings. Exercised in the dev app against local fake sites and example.com, not yet in a packaged build or on real HTTP-only sites.
- **Picture in picture from the context menu** and video controls such as
  Loop.
- Not yet checked by hand: a mouse's back and forward buttons and the
  three-finger swipe (synthetic input doesn't reach a page in a background
  window); the automatic retry after going offline (it is unit-tested).

Already clearing the bar: specific error pages with Retry and Go back; row
states for loading, error, unresponsive, audio, asleep and downloading; undo
toast for closes and workspace deletes; save-failure bar; safe startup with a
newer or corrupt database.

### Needs a decision

These brainstorm items aren't sorted into any phase yet:

- ~~**Recently closed list** outside the History menu.~~ Done: in the History panel.
- ~~**Close pages below** in the page menu.~~ Done.

## Later, after beta

Resizable split view · picture in picture controls and a "now playing" list · reader
mode · page screenshots · reading list · import from other browsers · export a
trail or workspace · semantic history search · AI page summaries · duplicate
page detection · profiles with separate data · per-workspace isolated logins ·
cross-device sync · extensions.

## Deliberately not planned

- **Tab groups as a separate concept.** Top-level trails and workspaces
  already group pages. A third grouping would make the model harder to learn.
- **Horizontal tab bar.** The vertical trail is Splash's identity.
