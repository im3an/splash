# How to build a good browser: research for Splash

Researched 4 November 2026. Every claim below is tied to a primary source (the
project that owns the fact). Where I could not reach the primary source, or the
fetch returned nothing useful, the claim is marked **unverified**. Nothing here
was tested in Splash itself.

## 1. Summary

1. **Do not fork Chromium.** The engine already gives Splash Chrome's page
   speed and process security. A fork adds a four-weekly rebase burden and a
   slower security-patch path. What is worth building is the shell, which
   Splash already is.
2. **Security is mostly about patch speed.** Electron's own checklist lists
   "Use a current version of Electron" as a recommendation, and the support
   window is only the latest three majors, so Splash needs auto-update and a
   routine for taking each Electron release.
3. **Speed is mostly shell work.** Electron's performance guide says to
   measure, lazy-load, keep the main process free, and bundle. Chromium
   already handles per-page process isolation and its memory cost.
4. **Three engine-level gaps decide what Splash can be:** no Chrome Web Store
   installs, no DRM video without a different Electron build, and a shrinking
   Manifest V2 world that uBlock Origin lives in.
5. **Distribution is a feature.** Notarisation, signing and updating decide
   whether anyone else can run the app.

## 2. Engine: what Chromium and Electron give you

### Process model and site isolation

- Chromium groups documents into "web site instances" and assigns each group
  to a renderer process. On desktop it uses full site isolation, where "each
  process is locked to documents from a single site", with a site defined as
  scheme plus eTLD+1.
- This protects sites against compromised renderers and Spectre-like attacks,
  but "at the cost of some memory overhead for each process". Chromium keeps
  that cost down with process reuse and a soft process limit based on
  available memory. Extensions are capped at one third of that limit.
- Embedders can mark origins that need a dedicated process
  (`ContentBrowserClient::GetOriginsRequiringDedicatedProcess`). That is a
  C++ hook, so it is not available from Electron JavaScript.

Source: [Process Model and Site Isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md);
[Site Isolation Design Document](https://www.chromium.org/developers/design-documents/site-isolation).

What it means for Splash: the process-per-site model comes for free. Memory
per page is a trade-off Chromium has already tuned, which is why putting idle
pages to sleep (Splash already does) is the right lever, not a custom process
model.

### Electron's release and support policy

- Electron supports the **latest three stable major versions**, releases a
  major every **8 weeks** (four weeks alpha, four weeks beta), and ties each
  major to a Chromium version.
- Current schedule (dates marked † in the source are tentative):

  | Electron | Chromium | Stable      | End of life  |
  | -------- | -------- | ----------- | ------------ |
  | 43       | M150     | 29 Jun 2026 | 5 Jan 2027†  |
  | 44       | M152     | 24 Aug 2026 | 2 Mar 2027†  |
  | 45       | M156     | 20 Oct 2026 | 27 Apr 2027† |
  | 46       | M160     | 5 Jan 2027† | 22 Jun 2027† |
  | 47       | M164     | 2 Mar 2027† | 17 Aug 2027† |

Source: [Electron Releases](https://www.electronjs.org/docs/latest/tutorial/electron-timelines),
[release schedule](https://releases.electronjs.org/schedule).

What it means for Splash: it runs Electron 45.0.0, which is supported until
27 April 2027 (tentative). Electron 46 arrives in early January 2027, so plan
an upgrade every 8 weeks. The 45.0.1 fix that uBlock Origin depends on is one
such patch release.

### Electron's security checklist

Electron's official checklist has 20 numbered recommendations, including:
only load secure content, no Node.js integration for remote content, context
isolation, process sandboxing, handling permission requests, keeping
`webSecurity` on, a Content-Security-Policy, limiting navigation and new
windows, never passing untrusted content to `shell.openExternal`, using a
current Electron, validating the sender of every IPC message, avoiding
`file://` in favour of custom protocols, and checking which fuses to change.

Source: [Electron security tutorial](https://www.electronjs.org/docs/latest/tutorial/security).

What it means for Splash: from the code and docs I read, most of these are
already in place (sandbox, context isolation, CSP, IPC validation, `app://`
protocol, fuses). The item the list stresses most, "use a current version",
depends on update tooling Splash does not have yet. Doyensec's
[Electronegativity](https://github.com/doyensec/electronegativity/wiki/Home/a06e3b27018c91e0ed2d3bc3194a3d8c8baefaea)
can scan for misconfigurations; I did not run it, and it is a third-party tool.

## 3. Extensions

### What Electron supports

Electron implements "a subset of the Chrome Extensions API", mainly for
DevTools and Chromium-internal extensions. It does **not** support arbitrary
Chrome Web Store extensions: only unpacked extensions load, through
`session.loadExtension`, and they must be re-loaded on every launch. The
supported-API list is partial (for example `tabs` is partly supported and
`storage.managed` is not).

Source: [Electron extensions API](https://www.electronjs.org/docs/latest/api/extensions).
The page does not say which manifest versions are supported (**unverified**).

### Manifest V2 in Chrome

- Chrome disabled Manifest V2 for all users in Chrome 138 (24 July 2025) and
  removed the enterprise policy in Chrome 139.
- All remaining Manifest V2 extensions were scheduled for removal from the
  Chrome Web Store on **31 August 2026**.

Source: [Manifest V2 support timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline).

What it means for Splash:

- Splash's uBlock Origin is the MV2 build from the project's own releases,
  loaded locally. That does not depend on the Web Store, but it depends on
  Electron and `electron-chrome-extensions` keeping MV2 working. Treat that as
  a risk to watch on each Electron upgrade (**my inference**, not stated in
  the sources).
- A "Chrome Web Store install" feature would only ever offer MV3 extensions,
  and uBlock Origin's Web Store version is the limited MV3 one. That affects
  the to-do item and the ad-blocking story.
- Whether a Web Store installer is feasible on Electron is not covered by the
  Electron docs above (**unverified**); check `electron-chrome-extensions`'s
  README before scoping it.

## 4. DRM video (Widevine)

Stock Electron does not include the Widevine CDM. castLabs' fork, "Electron
for Content Security", is described as a drop-in replacement that enables
Widevine, including Verified Media Path and persistent licences (persistent
licences deprecated as of v38). It has full support on macOS and Windows,
installs from a GitHub tag, downloads the Widevine CDM on first launch, and
needs `components.whenReady()` before opening a window. Production use needs
VMP signing through castLabs' EVS service; the supplied builds are signed for
development only.

Source: [castlabs/electron-releases](https://github.com/castlabs/electron-releases).

What it means for Splash: Netflix, Disney+ and similar sites will likely not
play until Splash moves to this fork or another CDM route. That is a real
daily-driver gap. Trade-offs to evaluate: castLabs' release lag behind stock
Electron (not stated in the source, so unverified), the EVS service
dependency, and whether the fork conflicts with the patched pieces
Splash relies on. The README does not list supported versions; its wiki does.

## 5. Performance

### What the sources actually say

Electron's performance guide: "Measure, Measure, Measure", then:

1. Check a module's cost before adding it.
2. Defer expensive setup until it is needed (lazy `require`).
3. Don't block the main process with CPU or disk work.
4. Don't block the renderer: `requestIdleCallback` for small tasks, Web
   Workers for heavy ones.
5. Skip polyfills Chromium already supports.
6. Bundle rarely-changing resources (such as fonts) with the app.
7. Bundle your code into one file to pay the `require()` cost once.
8. Call `Menu.setApplicationMenu(null)` before ready when no default menu is
   needed.

Source: [Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance).

Chromium's own process-model document explains why memory per page is a
design trade-off (more processes, more isolation, more memory), not
something an embedder can change cheaply.

### Benchmarks

Speedometer is a benchmark built in collaboration between browser vendors
that measures web-application responsiveness. Because Splash uses Blink, its
score tracks Chrome's for the same Chromium version; a result well below
Chrome's would point to a flag or shell problem rather than the engine. I
found Google's blog post only through press coverage of it, and I did not
find Chromium's primary documentation on startup or memory metrics, so
**how to measure startup and memory is unverified**. Plan to measure with
Electron's `app.getAppMetrics()` and macOS tools instead of relying on a
published methodology.

### Practical plan (derived from the above, not itself sourced)

- Record a baseline: cold start to first usable window, memory with 1, 25
  and 100 pages, shell frame rate while scrolling a large trail.
- Profile the main process at startup and move blocking work (database open,
  filter lists, extension loading) off the critical path.
- Confirm the bundler produces one main bundle (the Vite plugin likely
  does; **unverified**).
- Compare Splash with Chrome on the same Chromium milestone (M156 is
  Electron 45).

## 6. Distribution and trust

- Notarisation needs a Developer ID certificate, signing with the hardened
  runtime and a secure timestamp, submission with `notarytool`, and stapling.
  **Unverified:** the Apple documentation page returned no usable content
  when I fetched it, so this list comes from general knowledge. Read
  [Apple's notarisation guide](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
  before acting on it.
- Updating: not researched in a primary source in this pass. Electron's
  `autoUpdater` and `electron-updater` are the usual routes; check Electron's
  [updating applications](https://www.electronjs.org/docs/latest/tutorial/updates)
  tutorial before choosing.

## 7. Competitor reference: Horse

The product page the user supplied (pasted text) and the live page at
[browser.horse](https://browser.horse) describe: top-level "Trails" with
emoji names, shared live trails across windows with per-window collapse
state, keyboard shortcuts for moving and creating sub- and side-trails,
Markdown export by dragging a trail out, a 14-day trial then $70 a year, and
independent funding. The FAQ **answers** on extensions, DRM, website
compatibility, memory, sync and the engine were not on the page I could
fetch, so Horse's position on those is **unknown**. Its claims about
psychotherapy and ADHD are Horse's own marketing and I did not check them.
The feature ideas this produced are in `docs/todo.md`, Phase F.

## 8. What to do with this

1. Put "auto-update and a patch-within-days rule" ahead of any new security
   feature.
2. Decide the DRM question early, because switching to a castLabs build
   touches the release process.
3. Treat the MV2 dependency as a tracked risk, and re-check it on every
   Electron upgrade.
4. Build the baseline measurements before optimising anything.
5. Do not start a Chromium fork.

## 9. Gaps in this research

- How Arc, Zen, Vivaldi, Brave and Orion build their products: not fetched.
  The feature ideas in the to-do come from their marketing as I know it, not
  from their documentation.
- WebKit (`WKWebView`) as an alternative engine: not researched, so the
  trade-off versus Chromium is not covered.
- Brave's and others' privacy engineering: not researched.
- Electron-specific memory baselines: no primary source found.
