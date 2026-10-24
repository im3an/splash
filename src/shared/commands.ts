/**
 * Every user-facing command, with its title and shortcut. Shortcuts use
 * Electron accelerator syntax: the app menu registers them in the Electron
 * build, and the shell matches them itself when there is no native menu.
 * Behaviour lives in the renderer's command registry.
 */
export interface CommandSpec {
  title: string;
  shortcut?: string;
}

export const commandSpecs = {
  'page.new': { title: 'New Page', shortcut: 'CmdOrCtrl+T' },
  'page.new-child': { title: 'New Child Page', shortcut: 'Alt+CmdOrCtrl+T' },
  'page.rename': { title: 'Rename Page', shortcut: 'F2' },
  'page.close': { title: 'Close Page', shortcut: 'CmdOrCtrl+W' },
  'page.close-tree': {
    title: 'Close Page and Children…',
    shortcut: 'Alt+CmdOrCtrl+W',
  },
  'page.move-up': { title: 'Move Up', shortcut: 'Alt+CmdOrCtrl+Up' },
  'page.move-down': { title: 'Move Down', shortcut: 'Alt+CmdOrCtrl+Down' },
  'page.indent': {
    title: 'Nest Under Page Above',
    shortcut: 'Alt+CmdOrCtrl+Right',
  },
  'page.outdent': {
    title: 'Move Out of Parent',
    shortcut: 'Alt+CmdOrCtrl+Left',
  },
  'nav.back': { title: 'Back', shortcut: 'CmdOrCtrl+[' },
  'nav.forward': { title: 'Forward', shortcut: 'CmdOrCtrl+]' },
  'nav.reload': { title: 'Reload Page', shortcut: 'CmdOrCtrl+R' },
  'nav.stop': { title: 'Stop', shortcut: 'CmdOrCtrl+.' },
  'address.focus': { title: 'Open Location…', shortcut: 'CmdOrCtrl+L' },
  'sidebar.toggle': { title: 'Toggle Sidebar', shortcut: 'CmdOrCtrl+S' },
  'tree.collapse-all': { title: 'Collapse All' },
  'tree.expand-all': { title: 'Expand All' },
  'workspace.new': { title: 'New Workspace', shortcut: 'Shift+CmdOrCtrl+N' },
  'workspace.rename': { title: 'Rename Workspace' },
  'workspace.delete': { title: 'Delete Workspace…' },
  'workspace.next': { title: 'Next Workspace', shortcut: 'Ctrl+Tab' },
  'workspace.previous': {
    title: 'Previous Workspace',
    shortcut: 'Ctrl+Shift+Tab',
  },
  'workspace.select-1': { title: 'Workspace 1', shortcut: 'Ctrl+1' },
  'workspace.select-2': { title: 'Workspace 2', shortcut: 'Ctrl+2' },
  'workspace.select-3': { title: 'Workspace 3', shortcut: 'Ctrl+3' },
  'workspace.select-4': { title: 'Workspace 4', shortcut: 'Ctrl+4' },
  'workspace.select-5': { title: 'Workspace 5', shortcut: 'Ctrl+5' },
  'workspace.select-6': { title: 'Workspace 6', shortcut: 'Ctrl+6' },
  'workspace.select-7': { title: 'Workspace 7', shortcut: 'Ctrl+7' },
  'workspace.select-8': { title: 'Workspace 8', shortcut: 'Ctrl+8' },
  'workspace.select-9': { title: 'Workspace 9', shortcut: 'Ctrl+9' },
  'appearance.system': { title: 'System' },
  'appearance.light': { title: 'Light' },
  'appearance.dark': { title: 'Dark' },
  'help.shortcuts': { title: 'Keyboard Shortcuts', shortcut: 'CmdOrCtrl+/' },
} as const satisfies Record<string, CommandSpec>;

export type CommandId = keyof typeof commandSpecs;

export const commandIds = Object.keys(commandSpecs) as CommandId[];

export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && Object.hasOwn(commandSpecs, value);
}

/** Spec lookup that keeps the optional `shortcut` field in the type. */
export function specOf(id: CommandId): CommandSpec {
  return commandSpecs[id];
}
