import type { Session } from 'electron';
import type { Preferences, SpellingLanguage } from '../shared/preferences';

/*
 * Electron's `setSpellCheckerLanguages` does nothing on macOS, where Chromium
 * asks the system's spell checker instead. That checker takes its language from
 * these two defaults, and an app's own value wins over the system setting. It
 * reads them once, when it starts, so a new language applies at the next launch.
 * Turning spelling off applies at once.
 */
const AUTOMATIC_KEY = 'NSSpellCheckerAutomaticallyIdentifiesLanguages';
const LANGUAGE_KEY = 'NSPreferredSpellServerLanguage';

/** The parts of Electron's `systemPreferences` this needs. */
export interface AppDefaults {
  setUserDefault(key: string, type: 'boolean', value: boolean): void;
  setUserDefault(key: string, type: 'string', value: string): void;
  removeUserDefault(key: string): void;
}

interface SpellingPreferences {
  get(): Pick<Preferences, 'spellingLanguage'>;
  onChange(listener: (changed: Preferences) => void): () => void;
}

function apply(
  language: SpellingLanguage,
  session: Pick<Session, 'setSpellCheckerEnabled'>,
  defaults: AppDefaults,
): void {
  session.setSpellCheckerEnabled(language !== 'off');
  if (language === 'off') return;
  if (language === 'automatic') {
    // Removed rather than set, so the choice in macOS Settings applies again.
    defaults.removeUserDefault(AUTOMATIC_KEY);
    defaults.removeUserDefault(LANGUAGE_KEY);
    return;
  }
  defaults.setUserDefault(AUTOMATIC_KEY, 'boolean', false);
  defaults.setUserDefault(LANGUAGE_KEY, 'string', language);
}

/** Applies the spelling setting now and whenever it changes. */
export function keepSpelling(
  preferences: SpellingPreferences,
  session: Pick<Session, 'setSpellCheckerEnabled'>,
  defaults: AppDefaults,
): void {
  let applied = preferences.get().spellingLanguage;
  apply(applied, session, defaults);
  preferences.onChange(({ spellingLanguage }) => {
    if (spellingLanguage === applied) return;
    applied = spellingLanguage;
    apply(applied, session, defaults);
  });
}

/**
 * Adds or removes a word, kept in the profile and lasting across launches. Text
 * already on a page stops being marked at once. False if the word wasn't changed;
 * sessions that keep nothing on disk refuse.
 */
export function setDictionaryWord(
  session: Pick<
    Session,
    'addWordToSpellCheckerDictionary' | 'removeWordFromSpellCheckerDictionary'
  >,
  word: string,
  known: boolean,
): boolean {
  try {
    return known
      ? session.addWordToSpellCheckerDictionary(word)
      : session.removeWordFromSpellCheckerDictionary(word);
  } catch {
    return false;
  }
}
