# Splash product review, 4 November 2026

Branch `build/beta-essentials` at 6531144, plus uncommitted palette work.

**How this was made.** I read the source, the docs and the git history, and ran
the checks. I did not launch the app for this review (it would take keyboard
focus), so anything "verified" below comes from the earlier verification notes
in `docs/beta-readiness.md`, not from today.

**Checks today:** `tsc` clean, `oxlint` clean, `oxfmt` clean, 58 test files and
513 tests pass.

---

## 1. What is implemented

### Trail (the core idea)

- Pages form parent–child trails; ordinary links open as a child. Same-document links stay in place.
- Drag and drop to reorder or nest, with a drop preview.
- Keyboard walking: ↑ ↓ ← → Home End, Enter to open, F2 to rename.
- Keyboard moves: ⌥⌘ arrows reorder, nest and un-nest.
- Collapse a branch. A collapsed row still shows the hidden page count and any sound, download or error inside.
- Close Page, Close Branch, Close Other Pages. Undo toasts, plus ⌘Z for every trail edit.
- Reopen Closed (⇧⌘T), with the History menu listing recently closed pages and workspaces.
- Rename a page, add a note to it, duplicate it.
- Filter the trail (⌥⌘F), keeping ancestors of matches visible.
- Row states: loading, error, unresponsive, audio, muted, asleep, downloading, edited-form indicator.
- Sleeping pages: a limit on pages kept awake (6/12/24/48), with the least recently used put to sleep.
- Hover preview of a page.
- Pinned pages (⌘D) sit at the top of the trail; closing one puts it to sleep.

### Workspaces

- Create, rename, reorder, delete (with undo), switch (⌃1–9).
- Each has its own trail, active page, scroll position, split view and look.
- Move a page or branch to another workspace, by menu or by dragging onto the workspace bar, with "Go there" and Undo.
- Editing happens in a sidebar panel with live preview.
- Theme picker in Settings-style rows: presets or 1–3 custom colours on an Arc-style dot field (OKLCH), intensity and grain sliders, light/dark per workspace.
- Gradient colours are luminance-clamped so text keeps contrast.

### Navigation and search

- Command palette (⌘K), grouped into Pinned, Pages, Workspaces, Commands and History.
- `>` limits it to commands. About 27 commands, hidden when they don't apply.
- Inline address completion, address suggestions from open pages, history and search engine.
- Six search engines, with suggestions that can be switched off.
- Address bar in the toolbar or in the sidebar (Arc style).
- Find on page, zoom, reload, reload ignoring cache, stop.
- ⌘1–⌘8 and ⌘9, ⌃⇥ to step through rows, mouse back/forward buttons, three-finger swipe.
- History panel in the sidebar (⌘Y): search, remove, undo.

### Sidebar and saved things

- Bookmarks and nested folders.
- Saved groups of reusable pages.
- Favorites, shown as icon stacks that pop out.
- Resizable sidebar, with a keyboard-operable divider.
- Density, site names and branch lines can be switched.
- Site icons everywhere, falling back to `/favicon.ico`.

### Split view

- Compare a page with its parent or child, side by side (⌘\\).
- Survives workspace switches and restarts.
- Drag a page into a split.

### AI panel

- Shows Claude, ChatGPT, Perplexity, Gemini or Le Chat beside the page.
- Sign-in popups handled, providers kept alive in the background, "open as page".
- It is the provider's own web app, not an integration. It cannot see the current page.

### Privacy and security

- Real uBlock Origin (MV2), with a built-in Ghostery blocker covering network blocking until Electron 45.0.1.
- Cookie notices are rejected, never accepted.
- Per-site permissions, remembered, with a blocked indicator and a site settings popover.
- Links to other apps (mailto:, zoommtg:) ask first.
- Clear browsing data with undo for history. Clearing history also forgets closed pages.
- Typed form data is never written to disk.
- Hardened Electron fuses, strict CSP, sandboxed pages, IPC validated with zod, shell served from `app://splash`.
- HTTP authentication in a native sign-in window, with the origin shown.

### Browser basics

- Downloads: progress on the row, failure reasons, retry, reveal in Finder, unsafe-file warning, ask-where or fixed folder, ⌥⌘L.
- Print, Save Page As (MHTML), View Source, DevTools.
- Full screen from a video.
- Right-click menu: open link as child or in the background, download, copy image, Look Up, Search for, spelling suggestions, Inspect.
- Default-browser registration.
- Real Chrome extensions, from the Chrome Web Store or a folder, plus a toolbar extension area and an Extensions page in Settings.
- Leave-site protection through `beforeunload`, plus a warning for edited forms.
- Error pages that name the problem, with Retry. Offline pages reload themselves.
- Hung-page bar.

### Resilience

- SQLite store with migrations, a backup before each upgrade, safe startup when the database is newer, corrupt or locked.
- Visible save failures with retry, and a prompt on quit with unsaved changes.
- Damaged preferences recovered field by field.
- A crashed shell reloads itself.
- Startup choice: restore pages or open a new page.

### Design system and brand

- The Ripple mark and app icon. Warm charcoal dark by default, plus Paper light and System.
- One token system, with a test that fails on stray literal colours, sizes and radii.
- DESIGN.md and PRODUCT.md capture the rules. Reduce-motion is respected.
- Settings window with 7 sections and a shortcut reference.

---

## 2. Product review

### Overall

Splash is a credible, unusually polished beta for a one-person project. The
trail is a real idea (Horse and Arc fans will get it in 30 seconds), and the
failure handling is better than most browsers: named error pages, undo
everywhere, protected typed data, backups before migration. In roughly 11 days
and 46 commits you have the basics of a daily-driver browser.

**It is not yet something you could hand to non-technical people.** The gaps
are distribution and account-type features, not the core idea.

| Area                               | Grade | Why                                                                                                                             |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| Core concept (trail)               | A     | Distinct, coherent, deeply built (keyboard, undo, collapse state, filter).                                                      |
| Interaction quality                | A−    | Undo, confirmation and recovery are consistent. The docs show this was audited against a written bar.                           |
| Visual design                      | B+    | Strong identity and tokens. Still being refined (sidebar alignment, toolbar icon cluster) and Arc-influenced.                   |
| Browser basics                     | B−    | Strong on navigation and downloads. Missing password handling, import, PiP, Open File, private mode.                            |
| Privacy                            | A−    | Real uBO, consent never accepted, no telemetry. Caveat: network blocking depends on the built-in blocker until Electron 45.0.1. |
| Reliability                        | B+    | Good design and tests. Several real-world paths are untested (hung page, camera and mic, real mouse drags).                     |
| Distribution                       | D     | Ad-hoc signed, ZIP only, no notarisation, no auto-update.                                                                       |
| Differentiation vs Arc, Zen, Horse | B     | The trail and the workspace themes are yours. The sidebar and the palette follow Arc closely.                                   |

### What is strong

1. **The trail is the product.** Everything else (filter, split, collapsed-row badges, per-row state) reinforces it.
2. **Trust behaviours.** Undo toasts, ⌘Z, close protection, the form-data policy and the migration backups. This is the part most indie browsers skip.
3. **Privacy position.** Never clicking "Accept" on consent walls is a clear, defensible stance, and uBO is the real thing.
4. **Discipline.** There is a quality gate, a roadmap with "deliberately not planned" items, and a token guard test.
5. **Keyboard coverage.** Menus, the palette, trail navigation and moves are all reachable without a mouse.

### What is weak or risky

1. **Distribution blocks everything.** Without Developer ID signing and notarisation, outside testers hit Gatekeeper. There is also no update path, and the build is arm64 only (`out/Splash-darwin-arm64`).
2. **No password or autofill story, and no import.** Nobody switches their daily browser without bringing bookmarks and logins. This is the biggest adoption barrier. Combined with the missing private window, it is the main reason it can't yet be a main browser.
3. **The AI panel is a web view of someone else's site.** It is cheap and works, but it cannot see the page, and it breaks whenever a provider changes its sign-in. The "AI" row in the roadmap's "Later" list (summaries) is a different, deeper thing, so the panel should not be sold as AI integration.
4. **Hot-path files are large.** `TrailTree.tsx` is 1,347 lines, `browser-controller.ts` 1,686 and `app.css` 1,655. They still work, but each is a risk for regressions and slower iteration.
5. **Unverified real-world paths.** A hung page, camera and microphone prompts, real mouse side buttons and swipes, real drags with the OS mouse, and Print and Save dialogs. Most have unit tests, but the docs list them as not exercised.
6. **Network blocking has a dependency on Electron.** Until 45.0.1, uBO's MV2 `webRequest` blocking is stalled, so the Ghostery fallback does the work. The 45.0.1 upgrade needs a deliberate retest.
7. **Light theme accents.** Custom accents are not contrast-checked, and light accents reach only 3.3–6.7:1 on tinted frames.
8. **Identity risk.** The Arc-like sidebar, favorites, palette and theme picker are very close to Arc's visuals. The trail is what makes Splash different, so spend design effort there rather than on closer copies.

### Housekeeping I found while reading

- **The roadmap is out of date.** `docs/roadmap.md` still lists "Leave site? on close" as a release blocker, but the code has `beforeunload` handling and an edited-form flag, and the README documents it. It also mentions "Picture in picture" and "Open File" in two places.
- **Test counts differ.** `beta-readiness.md` says 486 tests, `design-review.md` says 368, and the run today shows 513.
- **Unmerged work.** `feat/arc-sidebar` has two commits that this branch does not:
  - the smart trail rule (`src/shared/trail-links.ts`, links branch only when leaving a site or search results, with a Settings → Trail switch);
  - filing a dragged page into a saved group.

  These match what you asked for on 2 and 3 November. `prototype-02-shell` is still a parts bin. `main` is 3 commits ahead of this branch and this branch is 8 ahead of `main`.

- **Uncommitted:** the palette's Tab-to-switch All/Commands scope (3 files).
- **Untracked:** `.claude/` and `sites/`. `sites/` holds a landing page and two tarballs. `.claude/launch.json` points at the old prototype worktree.

---

## 3. What is missing

### A. Blocks a public beta

- Developer ID signing and Apple notarisation.
- Auto-update, and a real installer (a DMG, not only a ZIP).
- Universal or x64 build (only arm64 is produced).
- Verification of camera and microphone prompts in the installed app.
- Verification of a genuinely hung page, mouse side buttons and swipe gestures.
- An in-app way to report a problem (there is no crash reporter or log export; "no telemetry" is a feature, but you need some route to get diagnostics from testers).

### B. Expected in any daily-driver browser

- Password manager, autofill, and saved cards or addresses.
- Import from Chrome, Safari or Firefox: bookmarks, history and logins.
- Private / incognito window.
- Open File (⌘O).
- Picture in picture (menu and site permission).
- A "New Window" command in the File menu (multiple windows exist in code; no menu item).
- Built-in translation.
- Reader mode.
- Page screenshots.
- Reading list.
- Export bookmarks or a trail.
- Profiles.
- Per-workspace isolated logins (this is the natural next step for workspaces).
- Cross-device sync.
- Keyboard shortcut customisation.
- Localisation (English only).

### C. Known gaps in what exists

- Open File, PiP and Loop controls on video.
- A resizable split view (and more than two panes).
- Contrast checks for custom accents.
- Extension APIs: some Chrome APIs are unavailable.
- A reading of the AI panel that includes the page (summarise this page, ask about the selection).
- Smart trail rule and Arc folder filing exist, but only on `feat/arc-sidebar`.

### D. Still open from the design pass

- Sidebar left-edge alignment and footer spacing.
- The toolbar icon cluster, where the red uBO badge draws the eye first.
- Panel search and selection state kept when leaving and reopening.
- Arrow-key navigation inside the workspace icon and colour grids.
- A walkthrough of populated downloads, split view, offline recovery, narrow windows and reduced motion in the packaged app.

---

## 4. Suggested order

1. **Merge what's done.** Commit the palette work, and decide on `feat/arc-sidebar` (smart trail rule, folder filing). Refresh `docs/roadmap.md` so it matches the code.
2. **Make it installable.** Developer ID, notarisation, DMG, auto-update, a diagnostics route.
3. **Close the switch-blockers.** Import (bookmarks first), then password and autofill, then a private window.
4. **Double down on the trail.** Per-workspace logins, trail export, a better "what did I come from" view, and a page-aware AI action. These are the features no other browser has.
5. **Pay down structure** in `TrailTree`, `browser-controller` and `app.css` before the next big feature.
