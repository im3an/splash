# Password manager extensions in Splash

Tested 5 November 2026 in a throwaway dev build of Splash (Electron 45.0.0), not a
packaged one. Nobody signed in, so nothing here shows autofill working with a real
vault. 1Password wasn't tested.

## Summary

- **Bitwarden loads and runs**, up to its sign-in screen. Everything checked before
  sign-in works. Autofill itself is still untested.
- **iCloud Passwords doesn't work.** The extension loads, but Apple's helper app on
  the Mac ends immediately, so there's no connection to the passwords.
- **Installing is the bigger gap.** Bitwarden went in as an unpacked folder from its
  GitHub release. There's no Web Store install, and an unpacked copy doesn't update
  by itself.

## Bitwarden 2026.10.2

Source: `dist-chrome-2026.10.2.zip` from
[bitwarden/clients](https://github.com/bitwarden/clients/releases/tag/browser-v2026.10.2).
Its SHA-256 matched the digest GitHub lists.

| Check                                         | Result                                          |
| --------------------------------------------- | ----------------------------------------------- |
| Loads through the saved extensions list       | Yes                                             |
| Background service worker runs, wakes again   | Yes                                             |
| Toolbar button opens its popup                | Yes                                             |
| Reaches its sign-in screen                    | Yes (email entry shown, nothing submitted)      |
| Reaches `api.bitwarden.com`, past the blocker | Yes (public config, status 200)                 |
| Page scripts run on a sign-in form            | Yes (its isolated world is present)             |
| `tabs`, `scripting`, `webNavigation`          | Yes (sees the page, runs a script, sees a load) |
| `offscreen`, `alarms`, `idle`, `storage`      | Yes                                             |
| `contextMenus`, `notifications`               | Calls succeed; neither was seen on screen       |
| Data kept after a restart                     | Yes                                             |
| HTTP sign-in window still appears             | Yes, and closes on leaving the page             |
| `sidePanel`                                   | **Missing**, though the manifest asks for it    |

Not tested, because they need a signed-in vault or a real keypress:

- Autofill, the menu inside form fields, and saving a new login
- Keyboard shortcuts such as autofill and lock (`commands`)
- Its items in the right-click menu
- Passkeys
- Unlocking through the desktop app. An unpacked copy has a different extension ID
  from the store version (`obhojif…` here). If the desktop app only allows the store
  ID, unlocking that way can't work. That's a guess I didn't test

## iCloud Passwords 3.4.0

Source: the Chrome Web Store package, unpacked. Its manifest carries a key, so it
keeps its real ID, which Apple's helper lists as allowed.

- The worker, toolbar button and popup run, and it offers "Enable Password AutoFill"
  on a sign-in form.
- Its popup then says it "couldn't connect to a helper application on your Mac" and
  asks for "a supported web browser".
- Splash finds and starts the helper. It ends at once, and the write to it fails
  with `EPIPE`, which Splash logs as an unexpected main-process error. No dialog
  appears.
- Started from plain Node, away from Splash, the same helper is killed by `SIGKILL`.

**The cause isn't proven.** macOS logged nothing about it. The behaviour fits Apple
limiting who may start the helper, which code signing could affect, so a signed
Splash might behave differently. That needs a test with a Developer ID build.

## What Electron reports

On load, Electron warns that these permissions are unknown: `webNavigation`,
`privacy`, `contextMenus`, `sidePanel`, `notifications`, `declarativeContent`. The
electron-chrome-extensions library supplies some of them anyway. `sidePanel` and
`declarativeContent` were missing in Bitwarden's worker, the only one probed for this.

## Other things seen

- The order of toolbar icons changed after a restart: uBlock Origin moved from last
  to first.
- Other sessions' builds share the checkout's `.vite` folder and can break a launch
  there. Testing from a separate worktree avoided that.
