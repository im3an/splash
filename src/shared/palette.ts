/** Typing this first narrows the command palette to commands. */
export const COMMAND_PREFIX = '>';

/**
 * `palette` is ⌘K. `location` is the palette standing in for the address bar
 * on a blank page: whatever is typed, going there or searching for it comes
 * first. `address` is the address bar's own suggestions.
 */
export type PaletteScope = 'palette' | 'location' | 'address';
