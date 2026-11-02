import { useEffect, useSyncExternalStore } from 'react';
import { useShell } from '../stores/shell-store';

/** Apply interface preferences in both the browser and Settings windows. */
export function useInterfacePreferences() {
  const sidebarWidth = useShell(
    (state) => state.preferences?.sidebarWidth ?? 260,
  );
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${sidebarWidth}px`,
    );
  }, [sidebarWidth]);
  const density = useShell((state) => state.preferences?.density);
  const reduceMotion = useShell((state) => state.preferences?.reduceMotion);
  const systemReduced = useSyncExternalStore(subscribeMotion, systemMotion);
  useEffect(() => {
    const root = document.documentElement.dataset;
    root.density = density ?? 'comfortable';
    // One switch for CSS: macOS's Reduce motion or Splash's own.
    root.motion = reduceMotion || systemReduced ? 'reduced' : 'full';
  }, [density, reduceMotion, systemReduced]);
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function systemMotion(): boolean {
  return matchMedia(REDUCED).matches;
}

function subscribeMotion(onChange: () => void): () => void {
  const query = matchMedia(REDUCED);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
