import type { SplashApi } from '../shared/api';
import type { Appearance } from '../shared/types';
import { runCommand } from './commands/run-command';
import { usePreferences } from './stores/preferences-store';
import { useShell } from './stores/shell-store';

/** Pins the colour scheme; `system` leaves it to the OS via `color-scheme`. */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  if (appearance === 'system') delete root.dataset.theme;
  else root.dataset.theme = appearance;
}

/**
 * Feeds backend state and app-menu commands into the stores, and keeps the
 * backend in step with the shell's preferences. Returns a disconnect function.
 */
export function connectShell(splash: SplashApi): () => void {
  document.documentElement.dataset.backend = splash.backend;

  const store = useShell.getState();
  const unsubscribeSnapshot = splash.onSnapshot(store.receiveSnapshot);
  const unsubscribeCommands = splash.onUiCommand((command) => {
    void runCommand(command, {}, 'keyboard');
  });
  // Subscribe first so no update is missed; a pushed snapshot is never older
  // than the one we asked for, so it wins if it arrives first.
  void splash.getSnapshot().then((snapshot) => {
    if (useShell.getState().snapshot === null) store.receiveSnapshot(snapshot);
  });

  const syncAppearance = (appearance: Appearance) => {
    applyAppearance(appearance);
    splash.setAppearance(appearance);
  };
  syncAppearance(usePreferences.getState().appearance);
  const unsubscribePreferences = usePreferences.subscribe((state, previous) => {
    if (state.appearance !== previous.appearance) {
      syncAppearance(state.appearance);
    }
  });

  return () => {
    unsubscribeSnapshot();
    unsubscribeCommands();
    unsubscribePreferences();
  };
}
