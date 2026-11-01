# Splash beta candidate: 27 October 2026

## Product direction

Preserve the vertical trail as the primary browsing model. The supplied Horse references inform neutral surfaces, compact macOS controls, title/site hierarchy, soft selection and visible parent–child relationships. The command palette retains Splash's own interaction model. Workspace colour is restrained; no promotional layout, decorative gradient or new horizontal tab strip is introduced.

## Implemented in this pass

- Native `beforeunload` handling before page, branch, workspace, window and application close. Stay is the default. A hung close can be kept open or explicitly force-closed.
- Conservative edited-field protection. Only a boolean flag crosses from the isolated preload; no form values are sent. Edited pages are excluded from automatic memory suspension and show a kept-awake indicator.
- Captured history before view teardown, duplicate-close suppression, and recovery when a bulk close is canceled.
- Field-by-field preference recovery, valid bookmark recovery, ancestry repair, and a backup of the damaged original. Startup explains that recovery happened.
- Resizable, keyboard-accessible sidebar, saved width, bounded layout and rollback after save failure.
- Command search loading, failure and retry states; retained queries after failed actions; repeated activation protection.
- Quieter frame colour and stronger secondary text. Solid preset surfaces were checked numerically for secondary text contrast; this is not a claim of full WCAG conformance.
- Packaging exclusions for local agent configuration, environment files, development sources and scripts. Runtime bundles, dependencies, license and required assets remain included.

## State and recovery map

| Trigger/state                  | Visible treatment                            | Recovery/data retained                                            |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| A page asks to prevent leaving | Native Leave/Stay dialog, Stay selected      | Stay preserves the live page                                      |
| Edited fields are present      | Trail indicator; conservative close warning  | Kept awake until navigation or explicit leave                     |
| Native close hangs             | Keep Open / Force Close                      | Keep Open retains the view                                        |
| A branch close is canceled     | Branch remains in the trail                  | Declined page stays live; approved views can restore from history |
| A preference write fails       | Failure message; no success broadcast        | Previous settings remain authoritative                            |
| Saved preferences are damaged  | Recovery notice on startup                   | Valid fields/library recovered; raw original backed up            |
| Palette results fail           | Inline failure and Retry                     | Query retained                                                    |
| Palette action fails           | Inline failure; palette remains open         | Query and selection available to retry                            |
| Sidebar width save fails       | Failure feedback and width rollback          | Previous saved width retained                                     |
| A group opens partially        | Count of remaining pages and Retry remaining | Saved group retained; completed pages are not duplicated by retry |
| Folder/link removal            | Confirmation with Undo                       | Removed records can be restored                                   |
| Compact window or long labels  | Truncation, scrolling, bounded menus         | Sidebar footer remains reachable                                  |

## Verification

- Automated checks cover controller close cancellation, approved history capture, branch cancellation, repeated close, edited-page suspension protection, native lifecycle vetoes, hung close recovery, damaged preferences, failed writes, palette failures/retry, repeated activation and bounded sidebar resizing.
- Previous UI verification covered light/dark layouts, 720 × 480 sizing, menu anchoring, upward flipping, submenu navigation, Escape and focus restoration.
- `npm run check`: TypeScript, repository-wide lint/formatting and more than 420 tests pass at the final verification point.
- Packaged macOS checks in a separate profile: local HTTP page load, edited-field indicator, Stay preserving the exact draft, ordinary-link branching from a protected form, closing the child and returning to the intact parent, approved Leave completing, and Recently Closed entries in the native History menu.
- Direct testing exposed and fixed a native view lifecycle issue after approved close, plus beforeunload interfering with branch clicks. A fast-Return race could navigate the preceding query; the latest typed address now takes priority while suggestions are pending, with a regression test.
- The final application and ZIP build successfully. The ad-hoc signature passes `codesign --verify --deep --strict`. Archive inspection confirms runtime bundles and license are present and private development configuration is absent.
- A clean packaged quit/relaunch walkthrough is still a manual follow-up; automated session persistence/restore and closed-record tests pass. UI automation was interrupted while the QA app was being used, so this check is not claimed as completed.

## Distribution and device gates

- Developer ID signing and Apple notarization remain required for broad distribution. Local build signing is ad hoc.
- Camera/microphone permissions and macOS device authorization require a real device/call-site pass in the installed application.
- Real mouse side buttons, three-finger navigation, and a genuinely hung third-party renderer need hardware/manual verification.
- Picture-in-picture controls, browser import, password management, cross-device sync and Chrome Web Store installation are not provided by this beta.
- Closing recovery does not guarantee restoration of unsaved web content after a renderer crash, system crash or force quit.

No external publishing, deployment, installation of third-party extensions or changes to the user's daily browsing profile are part of this pass. Disposable QA profiles and a localhost-only form server were used for native behavior checks.
