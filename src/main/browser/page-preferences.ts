import type { WebPreferences } from 'electron';
import type { Preferences } from '../../shared/preferences';

/** The display settings a page's view is created with. */
export function pageWebPreferences(
  preferences: Pick<
    Preferences,
    'standardFont' | 'monospaceFont' | 'defaultFontSize' | 'minimumFontSize'
  >,
): WebPreferences {
  const { standardFont, monospaceFont } = preferences;
  return {
    defaultFontSize: preferences.defaultFontSize,
    minimumFontSize: preferences.minimumFontSize,
    defaultFontFamily: {
      ...(standardFont ? { standard: standardFont } : {}),
      ...(monospaceFont ? { monospace: monospaceFont } : {}),
    },
  };
}
