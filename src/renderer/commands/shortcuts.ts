/**
 * Electron accelerator strings ("Alt+CmdOrCtrl+Up") matched against DOM
 * keyboard events and formatted for display. Keys are matched by physical
 * `code`, because on macOS ⌥ changes the character a key produces.
 */

interface ParsedShortcut {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const KEY_CODES: Record<string, string> = {
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '/': 'Slash',
  '.': 'Period',
  ',': 'Comma',
  Tab: 'Tab',
};

const KEY_SYMBOLS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Tab: '⇥',
};

function parse(accelerator: string, isMac: boolean): ParsedShortcut {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const has = (name: string) => parts.includes(name);
  const cmdOrCtrl = has('CmdOrCtrl');
  return {
    meta: has('Cmd') || (cmdOrCtrl && isMac),
    ctrl: has('Ctrl') || (cmdOrCtrl && !isMac),
    alt: has('Alt'),
    shift: has('Shift'),
    key,
  };
}

function codeFor(key: string): string {
  if (KEY_CODES[key]) return KEY_CODES[key];
  if (/^[A-Z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return key;
}

export interface KeyLike {
  code: string;
  key?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Some keyboards (virtual, remote, synthesized) leave `code` empty; fall
 * back to the character or key name they do report.
 */
function sameKey(event: KeyLike, key: string): boolean {
  if (event.code) return event.code === codeFor(key);
  const reported = event.key ?? '';
  const expected = codeFor(key).startsWith('Arrow') ? codeFor(key) : key;
  return reported.toLowerCase() === expected.toLowerCase();
}

export function matchesShortcut(
  event: KeyLike,
  accelerator: string,
  isMac: boolean,
): boolean {
  const shortcut = parse(accelerator, isMac);
  return (
    sameKey(event, shortcut.key) &&
    event.metaKey === shortcut.meta &&
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift
  );
}

/** "Alt+CmdOrCtrl+Up" → "⌥⌘↑" on macOS, "Ctrl+Alt+Up" elsewhere. */
export function formatShortcut(accelerator: string, isMac: boolean): string {
  const shortcut = parse(accelerator, isMac);
  const key =
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  if (isMac) {
    return [
      shortcut.ctrl && '⌃',
      shortcut.alt && '⌥',
      shortcut.shift && '⇧',
      shortcut.meta && '⌘',
      KEY_SYMBOLS[key] ?? key,
    ]
      .filter(Boolean)
      .join('');
  }
  return [
    shortcut.ctrl && 'Ctrl',
    shortcut.alt && 'Alt',
    shortcut.shift && 'Shift',
    shortcut.meta && 'Meta',
    key,
  ]
    .filter(Boolean)
    .join('+');
}

export function detectMac(platform: string): boolean {
  if (platform === 'darwin') return true;
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}
