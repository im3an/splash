# Splash

A macOS-first Chromium browser built around persistent **trails**: pages keep their parent–child relationships, so research and everyday browsing stay organized without a horizontal tab strip.

Splash is a **local beta candidate**. It has real Chromium page views, workspaces, persistent history, bookmarks and folders, saved page groups, downloads, permissions, and recovery flows. Developer ID signing and notarization are still required before broad distribution. See [beta-readiness.md](docs/beta-readiness.md) for verification and remaining release checks.

## Run and build

```sh
npm install
npm start          # Electron + Vite development app
npm run check      # TypeScript, lint, formatting, and tests
npm run package    # out/Splash-darwin-arm64/Splash.app
npm run make       # packaged app plus a local ZIP under out/make/
```

Build on macOS for the native app. The build fetches the bundled extension if it is missing. Local packages receive an ad-hoc signature, not a Developer ID signature or notarization. Do not describe these artifacts as notarized releases.

## Daily browsing

- Open a page with **⌘T**. Ordinary links grow a child page in its trail; same-document links stay in place. Back and forward include the trail relationship.
- **⌘L** focuses the address field, and suggests bookmarks and history as you type. **⌘K** searches pages, bookmarks, workspaces, commands and history. Prefix a query with `>` to search commands.
- Pin an important page with **⌘D**. Closing a pinned page puts it to sleep when another page can take its place. The context menu can unpin and close it.
- The toolbar star saves a bookmark. Bookmarks (⌥⌘B) searches, renames, moves and deletes them, many at once. Drag a page or link onto Bookmarks or a folder to file it, or use Bookmark Branch to save a whole branch as a folder. An optional bookmarks bar (⇧⌘B) sits over the page. A saved group holds a reusable set of pages. These are separate from live pinned pages.
- Right-click a page, folder or saved link for contextual actions. Menus support arrows, type-ahead and Escape; folder actions are also available through their visible action button.
- Drag the sidebar divider to give long titles more room. The divider supports arrow keys, Home, End, and double-click to reset. Width and toolbar layout survive restarts.
- Workspaces keep their own trail, selected page, scroll position, appearance and split view. **⌃1–9** switches workspaces.
- **⌘\\** compares related pages in split view. **⌘F** finds in a page; **⌘+**, **⌘−** and **⌘0** control zoom.
- **⌘Y** opens history; **⌥⌘L** opens downloads. Failed downloads offer recovery and completed files can be revealed in Finder.
- **⌘P** prints, **⇧⌘S** saves a web archive, **⌥⌘U** opens source, and **⇧⌘C** copies the page address.

Settings contains General, Appearance, Workspaces, Privacy, Downloads, Shortcuts and Advanced. The address field can live in the top toolbar or sidebar. Workspace accents remain quiet against neutral surfaces; system and in-app reduced motion are respected.

Privacy holds the tracking signal, third-party cookies, clearing data on quit and a cookie list per site. JavaScript, images and autoplay can be blocked per site from the site's info popover. The dangerous-site warning checks addresses on this Mac against phishing and malware lists Splash downloads from malware-filter every 12 hours; addresses you visit are not sent anywhere for this.

## Protecting work

Normal page, branch, workspace, window and application close paths consult each live page before destroying its view. Sites can veto leaving through Chromium's `beforeunload` lifecycle. Splash adds no leave warning of its own; pages with edited fields are only kept awake rather than automatically suspended. The flag contains no field values and does not claim to know whether a site saved the work.

A canceled close retains the trail and the page that refused to leave. During a canceled bulk close, already approved views can be restored from captured Chromium history. Recovery after a crash is best effort; unsaved web application content is not guaranteed to survive a crash or forced termination.

Trail changes are saved to SQLite, with visible save failures and retry. Failed preference writes do not replace the in-memory settings or announce success. Damaged preferences are recovered field by field; valid bookmarks are retained where possible, and the original value is backed up in the local database as `preferences:recovery`.

## Extensions and sharing

The bundled extension and unpacked Chrome extensions run through Electron and `electron-chrome-extensions`. Add them from the Chrome Web Store or a folder, and manage them in Settings → Extensions. Some Chrome APIs are unavailable. Only load extensions you trust.

The share control uses the native macOS share menu. Folder and group menus can copy their links for sharing; this does not create a public or synchronized collection.

## Architecture and security

`BrowserController` owns workspace trees, page state, history and view visibility. `PageHost` isolates Electron view operations from the testable controller. The shell renders snapshots through React and Zustand. `SessionPersister` writes sessions through the SQLite storage boundary.

The shell and web pages use separate sessions, sandboxing and context isolation. Web content has no Node.js API or shell bridge. Page preloads report only narrowly defined interactions. Shell IPC is origin-checked and validated against strict schemas; ordinary navigation is restricted to HTTP(S), with explicit handling for approved extension pages and web source. Permissions are decided per site. Packaged builds use a strict content security policy and hardened Electron fuses.

## QA without touching daily browsing

For a separate test profile, create an empty directory and pass it as `--user-data-dir=<absolute path>` when launching Splash (development builds: `npm start -- --user-data-dir=<path>`; installed app: `open -n -a Splash --args --user-data-dir=<path>`). Development builds also accept `SPLASH_USER_DATA_DIR`; installed builds ignore it. The test profile gets its own database and web session. Never point two running processes at the same profile. Tests should use local, disposable content and avoid entering real credentials.

The current beta checklist and known limitations live in [docs/beta-readiness.md](docs/beta-readiness.md).
