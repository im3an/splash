import type { Preferences, SpellingLanguage } from '../shared/preferences';
import { keepSpelling, setDictionaryWord, type AppDefaults } from './spelling';

function setup(language: SpellingLanguage) {
  const values = new Map<string, unknown>([
    ['NSSpellCheckerAutomaticallyIdentifiesLanguages', true],
  ]);
  const defaults: AppDefaults = {
    setUserDefault: (key: string, _type: string, value: unknown) => {
      values.set(key, value);
    },
    removeUserDefault: (key) => {
      values.delete(key);
    },
  };
  const session = { setSpellCheckerEnabled: vi.fn() };
  let listener: (changed: Preferences) => void = () => {};
  keepSpelling(
    {
      get: () => ({ spellingLanguage: language }),
      onChange: (next) => {
        listener = next;
        return () => {};
      },
    },
    session,
    defaults,
  );
  return {
    values,
    session,
    change: (spellingLanguage: SpellingLanguage) =>
      listener({ spellingLanguage } as Preferences),
  };
}

describe('keepSpelling', () => {
  it('sets the language for the next launch', () => {
    const { values, session } = setup('de');
    expect(values.get('NSPreferredSpellServerLanguage')).toBe('de');
    expect(values.get('NSSpellCheckerAutomaticallyIdentifiesLanguages')).toBe(
      false,
    );
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(true);
  });

  it('hands the choice back to macOS on automatic', () => {
    const { values, change } = setup('de');
    change('automatic');
    expect(values.size).toBe(0);
  });

  it('turns checking off at once and keeps the language for later', () => {
    const { values, session, change } = setup('de');
    change('off');
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(false);
    expect(values.get('NSPreferredSpellServerLanguage')).toBe('de');
  });

  it('turns checking back on when a language is chosen again', () => {
    const { session, change } = setup('off');
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(false);
    change('fr');
    expect(session.setSpellCheckerEnabled).toHaveBeenLastCalledWith(true);
  });

  it('does nothing when another preference changes', () => {
    const { session, change } = setup('de');
    session.setSpellCheckerEnabled.mockClear();
    change('de');
    expect(session.setSpellCheckerEnabled).not.toHaveBeenCalled();
  });
});

describe('words in the dictionary', () => {
  function dictionary(works = true) {
    return {
      isPersistent: () => true,
      addWordToSpellCheckerDictionary: vi.fn(() => works),
      removeWordFromSpellCheckerDictionary: vi.fn(() => works),
    };
  }

  it('adds and removes a word', () => {
    const session = dictionary();
    expect(setDictionaryWord(session, 'Splashy', true)).toBe(true);
    expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith(
      'Splashy',
    );
    expect(setDictionaryWord(session, 'Splashy', false)).toBe(true);
    expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith(
      'Splashy',
    );
  });

  it('says when the word wasn’t kept', () => {
    expect(setDictionaryWord(dictionary(false), 'Splashy', true)).toBe(false);
  });

  it('counts a session that refuses as not kept', () => {
    const session = dictionary();
    session.addWordToSpellCheckerDictionary.mockImplementation(() => {
      throw new Error('Spellcheck API is not available');
    });
    expect(setDictionaryWord(session, 'Splashy', true)).toBe(false);
  });
});
