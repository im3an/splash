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

## Open before beta

- Picture in picture as a site permission: Chromium doesn't expose it, so it
  isn't in site settings yet.
- Verify the hang ("isn't responding") bar with a real hung page; it couldn't
  be triggered from automation.
- Verify camera and microphone prompts with a real call site, and the macOS
  access prompts in the installed app.
- Code signing and notarisation for distribution.

## Later, after beta

Split view · picture in picture controls and a "now playing" list · reader
mode · page screenshots · reading list · import from other browsers · export a
trail or workspace · semantic history search · AI page summaries · duplicate
page detection · profiles with separate data · per-workspace isolated logins ·
cross-device sync · extensions.

## Deliberately not planned

- **Tab groups as a separate concept.** Top-level trails and workspaces
  already group pages. A third grouping would make the model harder to learn.
- **Horizontal tab bar.** The vertical trail is Splash's identity.
