import { commandSpecs, specOf, commandIds } from '../../shared/commands';
import { formatShortcut, matchesShortcut, type KeyLike } from './shortcuts';

const key = (code: string, modifiers: Partial<KeyLike> = {}): KeyLike => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('matchesShortcut', () => {
  it('maps CmdOrCtrl to ⌘ on macOS and Ctrl elsewhere', () => {
    expect(
      matchesShortcut(key('KeyT', { metaKey: true }), 'CmdOrCtrl+T', true),
    ).toBe(true);
    expect(
      matchesShortcut(key('KeyT', { ctrlKey: true }), 'CmdOrCtrl+T', true),
    ).toBe(false);
    expect(
      matchesShortcut(key('KeyT', { ctrlKey: true }), 'CmdOrCtrl+T', false),
    ).toBe(true);
  });

  it('requires exactly the listed modifiers', () => {
    expect(
      matchesShortcut(
        key('KeyT', { metaKey: true, altKey: true }),
        'CmdOrCtrl+T',
        true,
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        key('ArrowUp', { metaKey: true, altKey: true }),
        'Alt+CmdOrCtrl+Up',
        true,
      ),
    ).toBe(true);
  });

  it('matches by physical key so ⌥ does not change the letter', () => {
    expect(
      matchesShortcut(
        key('KeyT', { metaKey: true, altKey: true }),
        'Alt+CmdOrCtrl+T',
        true,
      ),
    ).toBe(true);
  });

  it('handles punctuation, digits, Tab and function keys', () => {
    expect(
      matchesShortcut(
        key('BracketLeft', { metaKey: true }),
        'CmdOrCtrl+[',
        true,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(key('Digit3', { ctrlKey: true }), 'Ctrl+3', true),
    ).toBe(true);
    expect(
      matchesShortcut(
        key('Tab', { ctrlKey: true, shiftKey: true }),
        'Ctrl+Shift+Tab',
        true,
      ),
    ).toBe(true);
    expect(matchesShortcut(key('F2'), 'F2', true)).toBe(true);
  });

  it('falls back to the reported key when the code is missing', () => {
    expect(
      matchesShortcut(
        { ...key(''), key: '/', metaKey: true },
        'CmdOrCtrl+/',
        true,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { ...key(''), key: 'ArrowUp', metaKey: true, altKey: true },
        'Alt+CmdOrCtrl+Up',
        true,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { ...key(''), key: 'x', metaKey: true },
        'CmdOrCtrl+T',
        true,
      ),
    ).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('writes macOS symbols in the standard order', () => {
    expect(formatShortcut('Alt+CmdOrCtrl+Up', true)).toBe('⌥⌘↑');
    expect(formatShortcut('Shift+CmdOrCtrl+N', true)).toBe('⇧⌘N');
    expect(formatShortcut('Ctrl+Shift+Tab', true)).toBe('⌃⇧⇥');
  });

  it('spells modifiers out elsewhere', () => {
    expect(formatShortcut('Alt+CmdOrCtrl+W', false)).toBe('Ctrl+Alt+W');
  });
});

describe('command shortcuts', () => {
  it('are unique', () => {
    const shortcuts = Object.values(commandSpecs)
      .map((spec) => ('shortcut' in spec ? spec.shortcut : null))
      .filter(Boolean);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('each parse to a key the matcher understands', () => {
    for (const id of commandIds) {
      const shortcut = specOf(id).shortcut;
      if (!shortcut) continue;
      expect(formatShortcut(shortcut, true)).not.toBe('');
    }
  });
});
