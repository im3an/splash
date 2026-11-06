import { useCallback, useEffect, useState } from 'react';
import { api } from '../splash-api';
import { Button, Row, Section } from './controls';

/** Words added from a page's right-click menu, with a way to take them out. */
export function DictionarySettings() {
  const [words, setWords] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const listed = await api().listDictionaryWords();
      setWords(listed.toSorted((a, b) => a.localeCompare(b)));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Words are added in another window, from a page.
    const reload = () => void load();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [load]);

  const change = async (word: string, known: boolean) => {
    setError(null);
    let changed = false;
    try {
      changed = await api().setDictionaryWord(word, known);
    } catch {
      // Reported below, the same as a word that wasn't changed.
    }
    if (!changed) {
      setError(`Couldn’t ${known ? 'add' : 'remove'} “${word}”. Try again.`);
      return;
    }
    setRemoved(known ? null : word);
    await load();
  };

  return (
    <Section title="Added words">
      {failed && words === null ? (
        <Row label="Added words unavailable" help="Couldn’t read the list.">
          <Button onClick={() => void load()}>Try again</Button>
        </Row>
      ) : words === null ? (
        <div className="h-12" aria-busy="true" />
      ) : words.length === 0 ? (
        <Row
          label="No added words"
          help="To add one, right-click a misspelled word on a page."
        />
      ) : (
        <ul className="max-h-72 divide-y divide-divider overflow-y-auto">
          {words.map((word) => (
            <li
              key={word}
              className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5"
            >
              <span className="min-w-0 truncate">{word}</span>
              <Button
                aria-label={`Remove ${word}`}
                onClick={() => void change(word, false)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(removed || error) && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <p
            role={error ? 'alert' : 'status'}
            className={`min-w-0 text-small ${error ? 'text-danger' : 'text-fg-muted'}`}
          >
            {error ?? `Removed “${removed}”.`}
          </p>
          {!error && removed && (
            <Button onClick={() => void change(removed, true)}>Undo</Button>
          )}
        </div>
      )}
    </Section>
  );
}
