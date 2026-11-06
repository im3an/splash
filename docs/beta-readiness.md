# Splash beta: 2 November 2026

## Product direction

The vertical trail stays the primary browsing model: pages open beneath the
page they came from, workspaces hold trails, and there is no horizontal tab
strip or separate tab-group concept. This pass makes Splash a warm,
dark-first macOS app with its own identity, one design system, and the
everyday browser features a beta tester expects.

## Implemented in this pass

Identity and look

- **The Ripple** is Splash's mark: a drop above a curved line. It's the app
  icon (terracotta on a warm charcoal tile), the Settings and About mark and
  Splash's own favicon. Masters live in `assets/brand/`; `npm run
brand:icons` regenerates the icon set.
- **Warm charcoal dark is the default** for new profiles. Light (Paper) and
  System remain in Settings › Appearance. Websites follow the theme through
  macOS's `prefers-color-scheme`, as in Safari.
- **One design system.** Colour, radius, shadow, spacing, type, motion and
  panel-size tokens in `tokens.css`, used through Tailwind utilities. A test
  keeps literal colours, sizes and radii out of components. See
  [DESIGN.md](../DESIGN.md).

Browsing

- **Links for other apps** (mailto:, tel:, zoommtg: …) ask before opening the
  app, and remember the answer per site. With no app for a link, Splash says
  so.
- **⌘Z undoes trail changes**: closes, moves, renames, moves to another
  workspace and Close Other Pages, and ⇧⌘Z redoes them. With focus in a page they
  work while the toast shows. In a text field both keys still edit the typing.
- **Filter the trail** (⌥⌘F): matching pages and their ancestors, matches
  marked, Return opens the first match, Escape clears, and an empty result
  offers "Search everywhere ⌘K".
- **Move pages from the keyboard**: ⌥⌘↑ ↓ reorder, ⌥⌘→ nests under the page
  above, ⌥⌘← moves out a level. Each move confirms with Undo.
- **Drag a page onto a workspace** in the bar at the foot of the sidebar to
  move it there, with Go there and Undo.
- **Close Other Pages** keeps the page's branch, its ancestors and pinned
  pages; one Undo brings everything back.
- **Palette**: Back, Forward, Print, Save page as, Close other pages, Close
  split view, Rename and Delete workspace. Reopen closed only shows when
  something can be reopened.
- **Startup choice**: Settings › General › When Splash opens: pages as I left
  them (default) or a new page.

Reliability and security

- The database is copied to `splash.db.pre-v<N>` before a migration runs.
- Typed form values and POST bodies are never written to disk; scroll
  position therefore isn't restored after a restart.
- Clearing history also forgets recently closed pages.
- A crashed shell or Settings window reloads, and says so.
- Splash's own windows load from `app://splash`, not `file://`; the
  `GrantFileProtocolExtraPrivileges` fuse is off.
- Sites can't `window.open` a bundled extension's pages.

Fixes found while testing this pass

- **Trail rows couldn't be dragged.** The page preview's pointer handler
  replaced the drag sensor's on every row (since 1 November). Fixed, with a
  test that fails without the fix. Drag announcements now name pages by
  title instead of reading out internal ids.
- **A blank page's location field stayed open** after switching to a
  workspace with pages, holding that page hidden behind a blank still.
- **Close Other Pages could fail** when a removed branch had children, and
  then refuse to reopen. Fixed with a regression test.
- **Node warned of a listener leak** at startup in the packaged app. The cause
  is electron-chrome-extensions adding a listener per extension event to
  uBlock's background page; its limit is raised for background pages.

## State and recovery map

| Trigger/state                   | Visible treatment                           | Recovery/data retained                                            |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| A page asks to prevent leaving  | Native Leave/Stay dialog, Stay selected     | Stay preserves the live page                                      |
| Edited fields are present       | Trail indicator; conservative close warning | Kept awake until navigation or explicit leave                     |
| Native close hangs              | Keep Open / Force Close                     | Keep Open retains the view                                        |
| A branch close is canceled      | Branch remains in the trail                 | Declined page stays live; approved views can restore from history |
| A page can't load               | Named error page with Try again             | Address kept; offline pages retry when back online                |
| A link wants another app        | Prompt naming the app; Open / Don't open    | Choice remembered per site; no app: a notice                      |
| Any trail change                | Toast with Undo                             | ⌘Z undoes it, from a page too while the toast shows               |
| A preference write fails        | Failure message; no success broadcast       | Previous settings remain authoritative                            |
| Saved preferences are damaged   | Recovery notice on startup                  | Valid fields/library recovered; raw original backed up            |
| The database needs an upgrade   | None                                        | Copy kept as `splash.db.pre-v<N>` beside it                       |
| The shell renderer crashes      | Reloads, then a notice                      | Pages keep running                                                |
| Palette results or actions fail | Inline failure and Retry                    | Query and selection retained                                      |
| Filtering finds nothing         | "No pages match", Search everywhere ⌘K      | Filter text kept                                                  |
| Compact window or long labels   | Truncation, scrolling, bounded menus        | Sidebar footer remains reachable                                  |

## Verification

What was run, and what it showed:

- `npm run check` (TypeScript, oxlint and oxfmt, Vitest): passing; 56 test
  files, 486 tests at the end of this pass.
- `npm run package`, then `codesign --verify` on the ad-hoc signed app:
  passes. Fuses read: RunAsNode off, OnlyLoadAppFromAsar on,
  GrantFileProtocolExtraPrivileges off.
- Packaged app, built from the committed tree in a clean worktree, on a fresh
  profile (`--user-data-dir`), driven over the DevTools protocol:
  - First run opens in warm dark with the palette ready and an empty-trail
    explanation.
  - Nested pages, long titles, site names and sleeping-page icons in the
    trail; quit and relaunch restored all six pages, both workspaces and the
    active page.
  - An empty workspace opens the palette; switching back to a workspace with
    pages closes it.
  - Address suggestions over a live page: open pages, history and engine
    suggestions.
  - Light theme applied live from Settings; dark again after.
  - 720 × 480 window in light and dark: no horizontal scroll, address and
    titles truncate, sidebar foot reachable.
  - Native full screen fills the display with the sidebar and toolbar intact.
  - Unreachable address: named error page with Try again and an error icon
    on the row. Closing it showed an Undo toast; Reopen closed restored it.
  - Dragging a row onto another workspace highlighted it, moved the page and
    confirmed with Go there and Undo. Dragging a row within the trail
    reordered it with an Undo toast.
  - Settings opens on General with the new "Changes are saved and apply as
    you make them" note.
  - No listener-leak warning in the packaged log.
- Development app (earlier in this pass): the mailto prompt and its
  remembered "Don't open"; the no-app notice; the startup new-page choice;
  the Ripple at 16 px; Close Other Pages 5 → 1 → 5 pages with Undo; the
  trail filter's highlighting and empty state; keyboard moves with Undo.

Not verified, and why:

- **⌘Z through the Edit menu.** Menu accelerators can't be driven over the
  DevTools protocol, so real key presses were sent to a test copy from outside
  it, with focus in a page and in a page's field. Pressing ⌘Z by hand is still part
  of the test list below.
- **Drags with the real mouse.** Rows were dragged with DOM pointer events in
  the packaged app. Synthetic OS mouse input didn't start a drag while the
  real cursor was over the window.
- **Print and Save page as dialogs.** They open native panels.
- **Camera, microphone, mouse side buttons, three-finger swipe, a genuinely
  hung page.** These need hardware or a real call site.

## How to test the beta

Build and open it:

```bash
npm install
npm run check
npm run package
open out/Splash-darwin-arm64/Splash.app
```

To keep your own profile untouched, start it with its own data folder:

```bash
out/Splash-darwin-arm64/Splash.app/Contents/MacOS/Splash --user-data-dir=/tmp/splash-beta
```

Then try, in about fifteen minutes:

1. **First run.** Dark, warm window; the palette is open. Type an address,
   press Return.
2. **Trail.** Click a few links: each opens beneath its page. Drag a row up or
   down, and to the right to nest it under the row above. Use ⌥⌘↑ ↓ ← → on a focused
   row. Press ⌘Z after each: the change undoes.
3. **Workspaces.** ⇧⌘N for a new one; drag a page from the trail onto its
   icon at the foot of the sidebar; use Go there in the toast. ⌃1 and ⌃2
   switch.
4. **Find things.** ⌘K for the palette (`>` for commands only); ⌥⌘F to
   filter the trail; ⌘Y for history.
5. **Close and recover.** ⌘W, then ⌘Z or ⇧⌘T. Close Other Pages from a row's
   ⋯ menu, then Undo.
6. **Errors.** Visit `https://nonexistent.invalid`; turn Wi-Fi off and reload
   a page, then turn it back on.
7. **Other apps.** Click a `mailto:` link: Splash asks before opening Mail.
8. **Settings** (⌘,). Switch Appearance to Light and back; set When Splash
   opens to A new page, quit and reopen.
9. **Restart.** Quit (⌘Q) and reopen: trails, workspaces and the current page
   return.
10. **Small and full screen.** Shrink the window as far as it goes; then
    ⌃⌘F for full screen.

Report anything that looks wrong or unclear with a screenshot and what you
expected.

## Remaining bugs and limitations

- Custom accents from the colour wheel aren't checked for contrast.
- Light-theme accents reach 3.3–6.7 : 1 on the tinted frames, enough for
  icons and monograms (3 : 1) but not for small text; accent is never used
  for text in light mode.
- The packaged log shows "Cannot find module 'electron-chrome-extensions/
  preload'" at startup. The library falls back, and Splash registers its own
  preload; it's noise, not a failure.
- Picture in picture from the context menu is missing.

## Distribution and device gates

- Developer ID signing and Apple notarization remain required for broad
  distribution. Local build signing is ad hoc.
- Camera/microphone permissions and macOS device authorization require a real
  device/call-site pass in the installed application.
- Real mouse side buttons, three-finger navigation, and a genuinely hung
  third-party renderer need hardware/manual verification.
- Browser import, password management and cross-device sync are not provided by
  this beta.
- Chrome Web Store downloads are checked against their CRX3 signatures before
  unpacking, but installed files aren't re-checked afterwards. Removing an
  extension leaves its stored data in the profile.
- Closing recovery does not guarantee restoration of unsaved web content after
  a renderer crash, system crash or force quit.

No external publishing, deployment or changes to anyone's daily browsing
profile were part of this pass. All app checks used disposable profiles.
