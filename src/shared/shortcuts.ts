/**
 * The keyboard shortcuts the palette's cheat sheet lists, grouped the way
 * people look for them. Each `keys` is what the app menu binds, so
 * `application-menu.test.ts` checks them against the menu.
 */
export interface ShortcutEntry {
  label: string;
  keys: string;
  /** The menu accelerator it stands for; absent for keys the menu can't hold. */
  accelerator?: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Everyday',
    entries: [
      { label: 'New page or command', keys: '⌘T', accelerator: 'CmdOrCtrl+T' },
      { label: 'Command palette', keys: '⌘K', accelerator: 'CmdOrCtrl+K' },
      { label: 'New window', keys: '⌘N', accelerator: 'CmdOrCtrl+N' },
      {
        label: 'New private window',
        keys: '⇧⌘N',
        accelerator: 'Shift+CmdOrCtrl+N',
      },
      { label: 'Close page', keys: '⌘W', accelerator: 'CmdOrCtrl+W' },
      {
        label: 'Reopen closed page',
        keys: '⇧⌘T',
        accelerator: 'Shift+CmdOrCtrl+T',
      },
      { label: 'Pin or unpin page', keys: '⌘D', accelerator: 'CmdOrCtrl+D' },
      {
        label: 'Copy URL',
        keys: '⇧⌘C',
        accelerator: 'Shift+CmdOrCtrl+C',
      },
      {
        label: 'Copy as Markdown',
        keys: '⌥⇧⌘C',
        accelerator: 'Alt+Shift+CmdOrCtrl+C',
      },
      { label: 'Edit address', keys: '⌘L', accelerator: 'CmdOrCtrl+L' },
      { label: 'Show or hide sidebar', keys: '⌘S', accelerator: 'CmdOrCtrl+S' },
      {
        label: 'Clear unpinned pages',
        keys: '⇧⌘K',
        accelerator: 'Shift+CmdOrCtrl+K',
      },
      { label: 'Keyboard shortcuts', keys: '⌘/', accelerator: 'CmdOrCtrl+/' },
    ],
  },
  {
    title: 'Pages and workspaces',
    entries: [
      { label: 'Go to page 1–9', keys: '⌘1 – ⌘9' },
      { label: 'Go to workspace 1–9', keys: '⌃1 – ⌃9' },
      { label: 'Next page', keys: '⌃⇥', accelerator: 'Ctrl+Tab' },
      {
        label: 'Previous page',
        keys: '⌃⇧⇥',
        accelerator: 'Ctrl+Shift+Tab',
      },
      {
        label: 'Next trail',
        keys: '⇧⌘↓',
        accelerator: 'Shift+CmdOrCtrl+Down',
      },
      {
        label: 'Previous trail',
        keys: '⇧⌘↑',
        accelerator: 'Shift+CmdOrCtrl+Up',
      },
      {
        label: 'New child page',
        keys: '⌥⌘T',
        accelerator: 'Alt+CmdOrCtrl+T',
      },
      {
        label: 'New sibling page',
        keys: '⌃⌘T',
        accelerator: 'Ctrl+CmdOrCtrl+T',
      },
      { label: 'Move page in the trail', keys: '⌥⌘ + arrows' },
      {
        label: 'Close branch',
        keys: '⌥⌘W',
        accelerator: 'Alt+CmdOrCtrl+W',
      },
      {
        label: 'Filter pages',
        keys: '⌥⌘F',
        accelerator: 'Alt+CmdOrCtrl+F',
      },
      {
        label: 'Toggle split view',
        keys: '⌘\\',
        accelerator: 'CmdOrCtrl+\\',
      },
      { label: 'Go back', keys: '⌘[', accelerator: 'CmdOrCtrl+[' },
      { label: 'Go forward', keys: '⌘]', accelerator: 'CmdOrCtrl+]' },
    ],
  },
  {
    title: 'Page and browsing',
    entries: [
      { label: 'Find on page', keys: '⌘F', accelerator: 'CmdOrCtrl+F' },
      { label: 'Find next', keys: '⌘G', accelerator: 'CmdOrCtrl+G' },
      {
        label: 'Find previous',
        keys: '⇧⌘G',
        accelerator: 'Shift+CmdOrCtrl+G',
      },
      { label: 'Reload', keys: '⌘R', accelerator: 'CmdOrCtrl+R' },
      { label: 'Zoom in', keys: '⌘+', accelerator: 'CmdOrCtrl+Plus' },
      { label: 'Zoom out', keys: '⌘−', accelerator: 'CmdOrCtrl+-' },
      { label: 'Actual size', keys: '⌘0', accelerator: 'CmdOrCtrl+0' },
      { label: 'Print', keys: '⌘P', accelerator: 'CmdOrCtrl+P' },
      {
        label: 'Save page as',
        keys: '⇧⌘S',
        accelerator: 'Shift+CmdOrCtrl+S',
      },
      {
        label: 'Picture in picture',
        keys: '⌥⌘P',
        accelerator: 'Alt+CmdOrCtrl+P',
      },
      {
        label: 'Developer tools',
        keys: '⌥⌘I',
        accelerator: 'Alt+CmdOrCtrl+I',
      },
      {
        label: 'View page source',
        keys: '⌥⌘U',
        accelerator: 'Alt+CmdOrCtrl+U',
      },
    ],
  },
  {
    title: 'Panels',
    entries: [
      { label: 'History', keys: '⌘Y', accelerator: 'CmdOrCtrl+Y' },
      { label: 'Downloads', keys: '⌥⌘L', accelerator: 'Alt+CmdOrCtrl+L' },
      { label: 'Bookmarks', keys: '⌥⌘B', accelerator: 'Alt+CmdOrCtrl+B' },
      {
        label: 'Bookmarks bar',
        keys: '⇧⌘B',
        accelerator: 'Shift+CmdOrCtrl+B',
      },
      { label: 'Notes', keys: '⌥⌘N', accelerator: 'Alt+CmdOrCtrl+N' },
      {
        label: 'AI panel',
        keys: '⇧⌘A',
        accelerator: 'Shift+CmdOrCtrl+A',
      },
      { label: 'Settings', keys: '⌘,', accelerator: 'CmdOrCtrl+,' },
    ],
  },
];

/** Entries whose label or keys have every typed word. */
export function matchShortcuts(query: string): ShortcutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SHORTCUT_GROUPS.map((group) => ({
    title: group.title,
    entries: group.entries.filter((entry) => {
      const text = `${entry.label} ${entry.keys} ${group.title}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.entries.length > 0);
}
