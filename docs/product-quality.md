# Splash product quality bar

Splash should feel premium because every detail shows someone thought about
the person using it, not because it looks nice. Every phase has to clear this
bar before it counts as done, and the check happens in the running app, not
only in tests.

## The phase gate

Ask these about every feature the phase touches:

1. **What just happened?** Every action gets visible confirmation: a page
   opens, a branch closes, a workspace switches.
2. **What is happening now?** Loading, playing, muted, crashed and offline are
   visible on the page's own trail row, not hidden somewhere else.
3. **What can I do next?** The next action sits next to the information that
   calls for it: retry on the error, unmute on the speaker icon.
4. **Can I undo it?** Anything that removes pages, workspaces or data can be
   undone, or warns first when it can't.
5. **Does it match the rest of Splash?** It uses the same words, menus,
   tokens and feedback patterns as everything else.
6. **What if it fails?** Network drops, renderer crashes, restarts mid-action
   and double clicks all leave the user's trail intact.

## States every surface designs

Default · hover · focus · pressed · loading · success · empty · error ·
disabled · offline · permission denied · recovering.

A feature isn't done when its happy path works. It's done when each of these
states either has a deliberate treatment or can't happen.

## Splash-specific rules

- **The trail is the product.** A page's state (loading, audio, muted, error,
  crashed, asleep) shows on its trail row, where the user already looks. A
  collapsed row summarises the state of the pages hidden under it.
- **Feedback doesn't depend on the sidebar.** Confirmations, undo offers and
  download progress still show when the sidebar is hidden.
- **No silent actions.** Copying, moving to another workspace and similar
  actions confirm what happened, in the same toast that offers undo.
- **No silent failures.** If a page is denied something (a permission, a
  download, a popup), the user sees what was blocked and how to allow it.
- **Specific copy.** "Couldn't reach example.com: you appear to be offline.
  Retry" beats "Something went wrong."
- **Protect the trail.** No action, crash or migration loses pages. Closing
  can be undone. Startup restores the last session.
- **One concept per idea.** Splash doesn't add a "tab group" concept beside
  trails and workspaces. A top-level trail already is the group.
- **Same words everywhere.** Use _page_ (never "tab"), _trail_, _branch_,
  _workspace_, _close_ (never "delete" for pages).
- **Tokens, not one-offs.** Colour, spacing, radii, shadows and motion come from
  `src/renderer/styles/tokens.css`.
- **Quiet motion.** Animate state changes and reordering. Don't animate for
  decoration. Respect reduced motion.
- **Every icon-only control** gets a tooltip, a hit area of at least 24px and
  an accessible name.

## Failure scenarios to walk through before beta

- The network drops while a page loads, and comes back.
- A page's renderer crashes or hangs.
- The app quits or crashes mid-drag, mid-close or mid-migration.
- The user double-clicks close, new page or workspace switch.
- The database is missing, corrupt or from a newer version.
- The user navigates away from a page and returns hours later (sleeping pages).
- A download fails halfway, or its file is moved before it opens.
