# Splash

A macOS-first Chromium browser where pages form persistent parent–child
**trails** instead of a flat row of tabs. Built with Electron, React and
TypeScript.

This is **Phase 1 — Foundation**: a reliable shell, one real Chromium page
view per page, and the seams the browsing-tree engine will grow from.

## Commands

```bash
npm start          # run in development (Vite HMR for the shell UI)
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
├── main/                      Electron main process
│   ├── main.ts                app lifecycle, single-instance, sessions
│   ├── menu.ts                application menu — owns all shortcuts
│   ├── windows/browser-window.ts   one window: shell + controller + layout
│   ├── browser/
│   │   ├── browser-controller.ts   pages, active page, visibility (no Electron imports)
│   │   ├── trail-tree.ts            pure parent/child structure
│   │   ├── page-host.ts             interface a page view implements
│   │   ├── electron-page-host.ts    WebContentsView implementation
│   │   ├── url.ts                   address-bar input → http(s) URL or search
│   │   └── layout.ts                content insets → view bounds
│   ├── ipc/register-ipc.ts    sender checks + zod validation for every message
│   ├── security/web-security.ts   sessions, permissions, global hardening
│   └── storage/trail-store.ts     persistence interface (SQLite in Phase 4)
├── preload/preload.ts         exposes `window.splash` — nothing else
├── shared/                    contract between processes
│   ├── types.ts               snapshots, errors, insets
│   ├── ipc.ts                 zod schemas (main process only)
│   └── api.ts                 `SplashApi` + event channels (zod-free, for preload)
└── renderer/                  shell UI (React, Zustand, Tailwind v4)
    ├── components/            Sidebar, TrailTree, Toolbar, AddressBar, ContentArea
    ├── stores/shell-store.ts  snapshot + UI state
    ├── lib/                   pure formatting and tree helpers
    └── styles/                design tokens + base styles
```

**The trail tree is the source of truth.** `BrowserController` owns a
`TrailTree` and each page's live state; Chromium views only display pages and
report events. The controller emits a full `BrowserSnapshot` (coalesced per
tick) that the shell renders. Because it talks to views through the
`PageHost` interface, it is tested in plain Node with fake hosts.

**Layout.** The shell reports where the content frame sits as window
_insets_. The main process turns those into view bounds itself, so the page
follows live window resizing without an IPC round trip.

**Visibility.** Only the active page's view is attached. A page with no
address, or whose load failed or crashed, is detached so the shell can draw
its own surface (new-page hint, error with Try again) in the same frame.

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

| Shortcut             | Action                                              |
| -------------------- | --------------------------------------------------- |
| ⌘T                   | New page                                            |
| ⌘L                   | Focus address bar                                   |
| ⌘W                   | Close page (closes the window when no pages remain) |
| ⌘R / ⌘.              | Reload / stop                                       |
| ⌘[ / ⌘]              | Back / forward                                      |
| ⌘S                   | Toggle sidebar                                      |
| ⌥⌘I                  | Developer tools for the page                        |
| Esc (in address bar) | Cancel editing, return focus to the page            |

Appearance (System / Light / Dark) is under **View → Appearance**.

## Known limitations (by design for Phase 1)

- **No persistence.** Pages are lost on quit; `TrailStore` is only an interface.
- **Link clicks navigate in place.** Only `window.open`, `target=_blank` and
  ⌘-click branch the trail. Making ordinary link clicks branch is Phase 2.
- **One window** is the tested path; IPC is routed per window but multiple
  windows are not exposed in the UI.
- **Views stay alive** when inactive (no discarding/suspension yet).
- **No address-bar suggestions.** Anything drawn over the content area would
  sit under the Chromium view; suggestions need an overlay view.
- **No permission prompts, downloads UI, context menus, find-in-page, zoom,
  or HTML fullscreen layout** (video fullscreen keeps the chrome visible).
- **No tree reordering, drag-and-drop or undo** (Phase 3).
- Sidebar rows support Enter/Space/←/→, but not arrow-key movement between
  rows yet.
- Appearance choice is not remembered between launches.

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
