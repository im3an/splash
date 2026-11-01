import { useEffect } from 'react';
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
  useEffect(() => {
    const root = document.documentElement.dataset;
    root.density = density ?? 'comfortable';
    root.motion = reduceMotion ? 'reduced' : 'system';
  }, [density, reduceMotion]);
}
