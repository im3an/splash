import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { z } from 'zod';
import type { Appearance } from '../../shared/types';

/** UI preferences that survive relaunches. Stored in the shell's localStorage. */
interface Preferences {
  appearance: Appearance;
  sidebarOpen: boolean;
}

interface PreferencesState extends Preferences {
  setAppearance(appearance: Appearance): void;
  setSidebarOpen(open: boolean): void;
  toggleSidebar(): void;
}

const DEFAULTS: Preferences = { appearance: 'system', sidebarOpen: true };

const storedPreferences = z
  .object({
    appearance: z.enum(['system', 'light', 'dark']).catch(DEFAULTS.appearance),
    sidebarOpen: z.boolean().catch(DEFAULTS.sidebarOpen),
  })
  .partial();

export const PREFERENCES_KEY = 'splash:preferences';

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAppearance: (appearance) => set({ appearance }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: PREFERENCES_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ appearance, sidebarOpen }) => ({
        appearance,
        sidebarOpen,
      }),
      // Whatever is on disk is untrusted: keep only well-formed values.
      merge: (persisted, current) => {
        const parsed = storedPreferences.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    },
  ),
);
