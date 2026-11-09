import { createContext, useContext } from 'react';
import type { SectionIconName } from './SectionIcon';

/** Lets a settings section send someone to another one. */
export const SettingsNavigation = createContext<(id: SectionIconName) => void>(
  () => {},
);

export const useSettingsNavigation = () => useContext(SettingsNavigation);
