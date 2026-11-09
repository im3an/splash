---
name: run-splash
description: Run, launch, drive and screenshot the Splash Electron browser on macOS for visual checks, design audits and in-app verification. Use when asked to run or start Splash, take screenshots of its screens (trail sidebar, palette, History, Downloads, workspace editor, Settings), switch light/dark, or confirm a UI change in the real running app.
---

# Run Splash

Splash is a macOS Electron browser (Forge + Vite + React). Agents drive a dev
instance over the Chrome DevTools Protocol with
`.Codex/skills/run-splash/driver.mjs`: no dependencies, since Node 24 has
`fetch` and `WebSocket` built in. Every path here is relative to the repo root.

## Prerequisites

macOS with Xcode command-line tools (`swift` and `screencapture` are used for
window captures), Node 24, `npm install` done.

## Run (agent path)

```bash
export SPLASH_RUN_DIR=<your scratchpad>/run   # profile, log, shots; default /tmp/splash-run
D=.Codex/skills/run-splash/driver.mjs
node $D launch          # electron-forge start on a throwaway profile, CDP port 9471
node $D wait            # until the shell renders (first start ~15 s)
node $D targets         # shell (localhost:517x/), Settings (#settings), one per page
```

Drive the shell by evaluating JS in it. `window.splash` is the preload API;
because Vite serves the renderer, importing a store returns the live instance,
as long as you import the URL the page loaded:

```bash
# The store module the app is actually running (see Gotchas: hot reload).
L="const live=(f)=>import(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('/stores/'+f)).sort().at(-1) ?? '/src/renderer/stores/'+f);"
O="$L const o=(await live('overlay-store.ts')).useOverlay.getState();"
S="$L const s=(await live('shell-store.ts')).useShell.getState();"
node $D eval "await window.splash.createPage('https://github.com'); 1"
node $D eval "$S s.setSidebarPanel('history'); 1"        # 'downloads' | 'history' | 'workspace' | null
node $D eval "$O await o.open({kind:'palette', scope:'palette'}); 1"   # scopes: palette | location | address
node $D eval "$S s.editWorkspace(null); 1"               # workspace editor panel
node $D eval "$O o.close(); 1"
node $D theme light     # or dark / system
node $D eval "window.splash.openSettings(); 1"
node $D eval "[...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === 'Privacy').click(); 1" settings
```

Screenshots land in `$SPLASH_RUN_DIR/shots/`:

```bash
node $D winshot main               # real window capture: shell AND page content
node $D ss settings-privacy settings   # CDP capture of one renderer (no page views)
node $D quit
```

Use `winshot` for the browser window. `ss` on the shell leaves holes where pages
are, because pages are separate WebContentsViews. It's fine for Settings.
Downscale before reading: `sips -Z 1400 in.png --out out.png`.

## Run (human path)

`npm start`. A window opens on the user's REAL profile. Don't run it as an agent.

## Test

```bash
npm test        # vitest, ~4 s, 495 tests
npm run check   # typecheck + lint + tests
```

## Gotchas

- **The new window takes keyboard focus.** If the user is typing elsewhere,
  their keystrokes land in the test window, which happened during this
  skill's creation. Expect stray pages or typed palette queries, and don't
  treat them as app bugs.
- **Stale screenshots from hidden windows.** Behind other apps, Chromium stops
  painting the window and freezes rAF and CSS transitions. Captures then show
  old state, such as a sliding selection indicator stuck on the previous
  item. `launch` passes `--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding --disable-background-timer-throttling`.
  Check with `node $D eval document.visibilityState`, which should print `"visible"`.
- **Blank white `winshot`.** Electron owns a hidden 500×500 helper window and
  39-px menu-bar windows. The driver picks the largest titled on-screen window.
  Pass a title substring to pick another (`winshot s Settings`).
- **Port clashes.** Other sessions run Splash on 9333/9357. Keep 9471, or pass
  a port: `node $D launch 9480`. Vite also moves to 5174+ when 5173 is taken.
  The shell matcher handles that.
- **Your instance can vanish mid-task.** Other sessions restarting their own
  dev Splash quit every `com.github.Electron` instance, often within minutes.
  You see `ECONNREFUSED 127.0.0.1:9471`, and `app.log` shows no crash.
  Relaunch and keep each check to one short command chain:
  `(node $D eval 1 >/dev/null 2>&1) || (node $D launch && node $D wait)`.
- **Menu shortcuts (⌘K, ⌘T) can't be sent over CDP.** Call the store or
  `window.splash.*` method the menu item calls.
- **A store edited since launch is a different module.** After hot reload
  the app imports `overlay-store.ts?t=…`. A plain
  `import('/src/renderer/stores/overlay-store.ts')` then returns a fresh,
  disconnected store: `o.open(...)` sets state and nothing renders. The `live`
  helper above imports the URL the page actually loaded.
- Renderer edits hot-reload into a running instance. Main-process edits need
  `quit` + `launch`. Edits from another session in this checkout hot-reload in too.
- The profile persists across launches in `$SPLASH_RUN_DIR/profile`. Delete it
  to get first-run state back (a new page showing the start page).
- On a cold start Vite reloads the shell once, so `window.splash` can be
  undefined right after the page loads. `wait` holds out for three steady
  seconds with the preload API present. Don't replace it with a single readiness check.
- `npm run check` lints and format-checks this skill directory too. After
  editing it, run `npx oxfmt --write .Codex/skills/run-splash/`.

## Troubleshooting

- `no target matching "shell"` → still compiling. Run `wait`, and check `$SPLASH_RUN_DIR/app.log`.
- Palette shows "Couldn't load results" → you passed an invalid `scope` (e.g. `commands`).
- `winshot` errors `no on-screen window` → the window is minimised or on
  another Space. Bring it to this Space, or use `ss`.
