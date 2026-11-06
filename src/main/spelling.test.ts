import type { Preferences, SpellingLanguage } from '../shared/preferences';
import { keepSpelling, type AppDefaults } from './spelling';

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
