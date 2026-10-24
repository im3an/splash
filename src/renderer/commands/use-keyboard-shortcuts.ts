import { useEffect } from 'react';
import { commandIds, specOf } from '../../shared/commands';
import { api } from '../splash-api';
import { useUi } from '../stores/ui-store';
import { runCommand } from './run-command';
import { detectMac, matchesShortcut } from './shortcuts';

/**
 * Matches command shortcuts while the shell has focus. In the Electron build
 * the app menu owns every shortcut (so it also works while a page is
 * focused) and this hook stands aside; the mock backend has no menu.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const splash = api();
    if (splash.backend === 'electron') return;
    const isMac = detectMac(splash.platform);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      // Menus and sheets handle their own keys.
      const { contextMenu } = useUi.getState();
      if (contextMenu) return;
      for (const id of commandIds) {
        const shortcut = specOf(id).shortcut;
        if (shortcut && matchesShortcut(event, shortcut, isMac)) {
          event.preventDefault();
          void runCommand(id, {}, 'keyboard');
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
