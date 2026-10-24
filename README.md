# Splash

A macOS-first Chromium browser where pages form persistent parent–child
**trails** instead of a flat row of tabs. Built with Electron, React and
TypeScript.

Phase 1 laid the foundation (a reliable shell, one real Chromium view per
page). **Prototype 02** makes the shell fully interactive: workspaces with
independent trails, renaming, reordering and nesting pages, context menus,
keyboard shortcuts, themes and remembered preferences.

## Commands

```bash
npm start          # run in development (Vite HMR for the shell UI)
npm run dev:web    # the shell alone in a browser, on simulated pages (:5174)
npm test           # unit + component tests (Vitest)
npm run typecheck  # strict TypeScript
npm run lint       # oxlint + oxfmt check
npm run check      # all three
npm run package    # build out/Splash-darwin-arm64/Splash.app
npm run make       # zip for distribution
```

## Architecture

```
src/
├── engine/                    browser core, no Electron imports
│   ├── browser-controller.ts  workspaces, pages, active page, visibility
│   ├── trail-tree.ts          pure parent/child structure (move, subtree removal)
│   ├── page-host.ts           interface a page view implements
│   └── url.ts                 address-bar input → http(s) URL or search
├── main/                      Electron main process
│   ├── main.ts                app lifecycle, single-instance, appearance
│   ├── menu.ts                application menu — built from the shared command list
│   ├── windows/browser-window.ts   one window: shell + controller + layout
│   ├── browser/electron-page-host.ts  WebContentsView implementation
│   ├── ipc/register-ipc.ts    sender checks + zod validation for every message
│   └── storage/trail-store.ts persistence interface (SQLite in Phase 4)
├── preload/preload.ts         exposes `window.splash` — nothing else
├── shared/
│   ├── types.ts               snapshots, workspaces, errors
│   ├── commands.ts            every command's title and shortcut
│   ├── ipc.ts                 zod schemas (main process only)
│   └── api.ts                 `SplashApi` — the backend the shell drives
└── renderer/                  shell UI (React, Zustand, Tailwind v4)
    ├── commands/              registry (behaviour), runCommand, shortcuts, menus
    ├── stores/                shell (backend mirror), ui (transient), preferences (persisted)
    ├── components/
    │   ├── sidebar/  tree/  workspace/  toolbar/  content/
    │   ├── overlays/          context menu, sidebar sheet, toasts
    │   └── common/            favicon, inline edit, shortcut labels
    ├── mock/                  simulated pages for `npm run dev:web`
    └── lib/                   pure formatting and tree helpers (move/drop targets)
```

**The trail tree is the source of truth.** `BrowserController` owns one
`TrailTree` and active page per workspace, plus each page's live state.
Chromium views only display pages and report events. The controller emits a
`BrowserSnapshot` (coalesced per tick) of the active workspace that the shell
renders. It talks to views through `PageHost`, so it is tested in plain Node
with fake hosts — and the mock backend runs the very same controller with
simulated hosts (`MockPageHost`: delayed loads, back/forward history,
failures).

**Commands.** Every action is a command: a title and shortcut in
`shared/commands.ts`, behaviour in `renderer/commands/registry.ts`, run
through `runCommand()` from buttons, context menus, shortcuts and the app
menu alike. Failures become a toast instead of an unhandled rejection. In
the app the native menu owns all shortcuts (so they work while a page has
focus); in the browser preview the shell matches them itself.

**Overlays live in the sidebar.** Anything drawn over the content area would
sit under the page's Chromium view, so context menus are clamped to the
sidebar, confirmations rise from its foot as a sheet, and toasts show there
(or at the toolbar's right edge while the sidebar is hidden).

**Theming.** Colours are written once as `light-dark()` tokens; `data-theme`
on `<html>` pins light or dark, and its absence follows the OS. The choice is
stored with the sidebar state in localStorage and mirrored to
`nativeTheme.themeSource`, so web pages and the window background follow.

**Layout.** The shell reports where the content frame sits as window
_insets_. The main process turns those into view bounds itself, so the page
follows live window resizing without an IPC round trip.

**Visibility.** Only the active workspace's active page is attached. A page
with no address, or whose load failed or crashed, is detached so the shell
can draw its own surface (new-page hint, error with Try again).

## Security

- Shell window: `sandbox`, `contextIsolation`, no Node integration, strict CSP
  (no inline script in production), cannot navigate or open windows.
- Web pages: separate `persist:web` session, sandboxed, no preload, only
  `http:`/`https:` navigations and redirects allowed.
- `window.open` / `target=_blank` never creates an Electron window — it
  creates a child page in the trail.
- IPC: a fixed set of channels; each message must come from the shell's main
  frame at the shell's own URL, and is parsed with a strict zod schema.
- Permissions: web pages get only fullscreen, pointer lock and sanitized
  clipboard writes; everything else (camera, mic, location, notifications,
  devices…) is denied until a permission prompt exists. The shell gets none.
- Address-bar input can only ever resolve to an http(s) URL or a search.
- Packaged builds flip Electron fuses (no `RunAsNode`, ASAR integrity, …).

## Keyboard

| Shortcut       | Action                                              |
| -------------- | --------------------------------------------------- |
| ⌘T / ⌥⌘T       | New page / new child of the current page            |
| ⌘L             | Focus address bar (Esc cancels editing)             |
| ⌘W / ⌥⌘W       | Close page / close page and its children (confirms) |
| F2             | Rename page (also double-click)                     |
| ⌥⌘↑ / ⌥⌘↓      | Move page up / down among its siblings              |
| ⌥⌘→ / ⌥⌘←      | Nest under the page above / move out of its parent  |
| ⌘[ / ⌘]        | Back / forward                                      |
| ⌘R / ⌘.        | Reload / stop                                       |
| ⇧⌘N            | New workspace                                       |
| ⌃1–9, ⌃⇥ / ⌃⇧⇥ | Switch workspace by position / next / previous      |
| ⌘S             | Toggle sidebar                                      |
| ⌘/             | Keyboard shortcuts                                  |
| ⌥⌘I            | Developer tools for the page                        |

In the sidebar tree: ↑/↓ move focus, ←/→ collapse/expand (or go to the
parent / first child), Return opens, ⌫ closes, ⇧⌫ closes with children,
Shift-F10 opens the context menu. Rows can be dragged to reorder or nest.

Appearance (System / Light / Dark) is in the sidebar footer and under
**View → Appearance**.

## Browser preview (mock backend)

`npm run dev:web` serves the shell on <http://localhost:5174> without
Electron. `window.splash` is then a mock backend: the real controller with
simulated pages seeded into three workspaces. Links on a simulated page
navigate in place; ⌘-click or the arrow opens one as a child page. Hosts
containing `offline` or ending in `.invalid` fail to load; `slow.*` hosts
take four seconds (try Stop). `window.splash.failNextCall()` makes the next
call fail, to see error handling.

## Known limitations

- **No persistence of pages or workspaces.** They are lost on quit;
  `TrailStore` is only an interface. Appearance and sidebar state are kept.
- **Link clicks navigate in place.** Only `window.open`, `target=_blank` and
  ⌘-click branch the trail. Making ordinary link clicks branch is Phase 2.
- **One window** is the tested path; IPC is routed per window but multiple
  windows are not exposed in the UI.
- **Views stay alive** when inactive (no discarding/suspension yet).
- **No address-bar suggestions.** Anything drawn over the content area would
  sit under the Chromium view; suggestions need an overlay view.
- **No permission prompts, downloads UI, page context menus, find-in-page, zoom,
  or HTML fullscreen layout** (video fullscreen keeps the chrome visible).
- **No undo** for closing pages or deleting workspaces; destructive actions
  ask first instead.
- Pages cannot be moved between workspaces.

## Next: Phase 2 — browsing engine

1. Decide the branching rule: which in-page navigations create a child page
   (likely: user-initiated cross-document link clicks) vs. navigate in place
   (redirects, form posts, same-document, back/forward). Implement it in
   `will-frame-navigate` → `BrowserController`, test it with fake hosts.
2. Track per-page history explicitly so back/forward and branching agree.
3. View lifecycle: discard inactive views past a budget and restore them on
   activation; handle `render-process-gone` with auto-recovery.
4. Redirect and popup edge cases (OAuth popups that need `window.opener`,
   `noopener`, downloads triggered by navigation).
