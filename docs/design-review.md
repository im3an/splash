# Splash design review, 27 October 2026

## Verdict

The existing direction is worth keeping: a compact macOS shell, warm and graphite surfaces, a personal workspace frame and a trail that preserves browsing relationships. The largest gaps were interaction completeness and consistency between surfaces. This pass strengthens those behaviors without replacing the visual identity.

The quality standard is the user's supplied premium-product principles and docs/product-quality.md: clear state, confirmation, recovery, predictable navigation and coherent controls. A valuation is not a design acceptance test.

## Decisions retained

| Decision                                                | Reason                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Vertical parent–child trail                             | It carries the product's primary distinction and keeps related pages together.    |
| Workspaces with their own frame and accent              | Personal identity and orientation without adding another grouping concept.        |
| System typography and compact controls                  | Appropriate for a macOS browser used throughout the day.                          |
| Rounded page surface with an 8px gutter                 | Visually separates web content from navigation without consuming excessive space. |
| Quiet controls, contextual state and restrained accents | Keeps attention on the page and makes active states meaningful.                   |
| Existing current-page marker preferences                | Preserve the user's established choices.                                          |

## Changes made

| Surface                | Gap                                                                | Resolution                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| History                | Blank initial load, no visible load failure                        | Announced loading skeleton, visible searching indicator, retry with context retained.                                                  |
| History search         | Empty result provided no direct way back                           | Shared empty-state hierarchy, clear-search button and contextual reset action. Existing rows stay in place while the next query loads. |
| History removal        | UI claimed removal before the request completed                    | Remove only on success; keep entries on failure; retain Undo if restoration fails.                                                     |
| Downloads              | Undifferentiated empty paragraph                                   | Same icon, heading and supporting-copy hierarchy as History.                                                                           |
| Workspace editor       | Duplicate submissions and invisible save failure                   | Saving state, synchronous submission guard, disabled editing during save and inline error with edits retained.                         |
| Workspace name         | Visible heading was not the input's accessible label               | Explicit accessible name.                                                                                                              |
| Shared choice controls | Three parallel implementations and no arrow-key behavior           | One segmented component for settings, workspace customization and site settings, with roving Tab focus, arrow navigation and Home/End. |
| Workspace navigation   | Tabs did not support conventional arrow navigation                 | Left/right and Home/End navigation; current workspace is the single Tab stop.                                                          |
| Dialogs                | Tab could move into controls behind the dialog                     | Shared focus containment for the palette, workspace editor and site settings.                                                          |
| Palette                | Escape was displayed as a noninteractive key badge                 | Usable, named close button with the existing visual treatment.                                                                         |
| Undo notices           | Expired during keyboard interaction                                | Pause while focus remains inside, including when the pointer leaves.                                                                   |
| Context menu           | Could exceed available sidebar width or window height              | Constrain to sidebar width and viewport height; scroll excess entries. Tab and Shift-Tab dismiss to the originating row.               |
| Anchored overlays      | Tall content could extend below the page frame                     | Constrain height and allow scrolling.                                                                                                  |
| Site settings          | Blank load, silent mutation failures, overbroad privacy promise    | Visible loading/retry, disabled choices during changes, inline failures and precise encrypted-connection copy.                         |
| Settings dropdowns     | Keyboard outlines were removed without a replacement               | Restore the shared focus ring and use existing size/radius tokens.                                                                     |
| Clear browsing data    | Failed clear/restore left the user guessing                        | Inline errors, busy restore state, and preserved Undo on failure.                                                                      |
| Settings motion        | In-app Reduce motion was only applied by the browser component     | Apply interface preferences in both windows.                                                                                           |
| Settings window        | Generic window title; Command-W could close a page behind Settings | Explicit Settings title; close the focused utility window before considering browser pages.                                            |
| Motion                 | Overshooting transitions and slow large moves                      | Non-overshooting settle curve and shorter large transitions; remove result-row cascades from History.                                  |

PRODUCT.md and DESIGN.md capture the existing direction and the interaction rules for future changes.

## Verification

- `npm run check`: strict TypeScript, lint, formatting and all 368 tests pass.
- New coverage exercises failed history reads/removal/restore, failed workspace saves, duplicate save prevention, modal Tab wrapping, keyboard-held Undo, segmented keyboard navigation, failed site-permission changes, failed data clearing/restoration, and focused-window close routing.
- Running development app uses a separate temporary profile. Visually checked light History, workspace creation, dark Downloads, Appearance settings and populated site settings.
- Opened a page in the restarted build, opened Settings, then pressed Command-W: Settings closed and the active browser page remained intact. Settings now has its own window title.
- Startup and browsing still work after the changes. No distribution package was produced in this pass.

## Remaining quality work

These are explicit limits, not completed checks:

1. Unify trail-edit undo with Command-Z. Existing toast recovery is still separate from the browser's edit history, as recorded in the roadmap.
2. Retain panel search and selection when leaving and reopening History. Scrolling within workspaces is already retained; panel state is still local.
3. Extend conventional radio-key navigation to workspace icon and color grids. The new shared segmented controls have it; visual swatch grids still use individual buttons.
4. Measure contrast across every frame/accent combination, including arbitrary custom colors. The existing palette was preserved; this is not a full WCAG conformance audit.
5. Repeat populated-download, split-view, offline recovery, long-name, narrow-window and reduced-motion walkthroughs in the packaged application. Bounds and reduced-motion rules are implemented, but those complete combinations were not all visually exercised here.
6. Complete the existing beta checks for real camera/microphone prompts, hung pages, signing and notarization. Those require separate integration and distribution validation.

## 27 October continuation: trail details and browser workflows

Preserved Splash's workspace colors, compact chrome, vertical trails and existing typography.

- Replaced the multiline native row tooltip with a delayed preview bounded to the sidebar. It dismisses on scrolling, resizing, keyboard interaction and pointer activation. Row entry reserves its full height immediately.
- Kept fixed-width anchored panels within the available page area.
- History now reads stored favicons, preserves them through deletion and Undo (including IPC validation), and shares known icons with older visits from the same host. Search, selection, scroll position and pending Undo survive leaving the panel. Storage errors propagate to the recovery UI instead of being reported as success.
- Save Page As uses Chromium's single-file MHTML archive, prevents concurrent saves for the same page, supports cancellation and retry, and confirms only a successful write. Verified a real file and the saved toast in the package.
- View Page Source creates a child page. The allowed URL policy admits source inspection only for HTTP(S), never local files or privileged browser URLs. Source pages retain distinct addresses, titles and icons.
- HTTP authentication has a dedicated sandboxed modal with origin identification, masked password input, loading/error handling and cancellation. Its IPC target exposes only the challenge and response. Requests finish once and detach when the page closes or navigates. Verified successful authentication against a disposable local server in the packaged app.

Release boundary: this is still a pre-release build. Unsaved-form close protection, Open File, real camera/microphone and hang recovery checks, and Developer ID signing/notarization remain outstanding. The available Apple Development identity does not satisfy public distribution. Do not label the ad-hoc package a signed public beta.
