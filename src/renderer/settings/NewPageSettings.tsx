import { useEffect, useRef, useState } from 'react';
import { normalizeHomepage, type Preferences } from '../../shared/preferences';
import { selectActivePage, useShell } from '../stores/shell-store';
import { Button, Choice, Row, Section } from './controls';

/** What a new page shows, and the homepage that one of those choices opens. */
export function NewPageSettings({
  preferences,
  update,
}: {
  preferences: Preferences;
  update(patch: Partial<Preferences>): void;
}) {
  const activeUrl = useShell((state) => selectActivePage(state)?.url ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(preferences.homepage ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  // Homepage was chosen with none set: the field needs filling in first.
  const [wanted, setWanted] = useState(false);

  useEffect(() => setText(preferences.homepage ?? ''), [preferences.homepage]);

  const commit = () => {
    const typed = text.trim();
    if (!typed) {
      setProblem(null);
      setWanted(false);
      if (preferences.homepage !== null) {
        update({
          homepage: null,
          // A new page can't open a homepage that's gone.
          ...(preferences.newPage === 'homepage' ? { newPage: 'start' } : {}),
        });
      }
      return;
    }
    const homepage = normalizeHomepage(typed);
    if (!homepage) {
      setProblem('That isn’t a web address. Try something like example.com');
      return;
    }
    setProblem(null);
    setText(homepage);
    setWanted(false);
    if (homepage !== preferences.homepage || wanted) {
      update({ homepage, ...(wanted ? { newPage: 'homepage' } : {}) });
    }
  };

  const webPage = activeUrl && normalizeHomepage(activeUrl);

  return (
    <Section title="New pages">
      <Row label="A new page shows">
        <Choice
          label="A new page shows"
          value={wanted ? 'homepage' : preferences.newPage}
          onChange={(newPage) => {
            if (newPage === 'homepage' && !preferences.homepage) {
              setWanted(true);
              inputRef.current?.focus();
              return;
            }
            setWanted(false);
            setProblem(null);
            update({ newPage });
          }}
          options={[
            { value: 'search', label: 'Search' },
            { value: 'start', label: 'Start page' },
            { value: 'homepage', label: 'Homepage' },
          ]}
        />
      </Row>
      <Row
        label="Homepage"
        help={
          problem ? (
            <span role="alert" className="text-danger">
              {problem}
            </span>
          ) : wanted ? (
            'Enter the address new pages should open.'
          ) : (
            'The Home button and ⇧⌘H go here.'
          )
        }
      >
        <input
          ref={inputRef}
          aria-label="Homepage"
          value={text}
          placeholder="example.com"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setText(preferences.homepage ?? '');
              setProblem(null);
              setWanted(false);
            }
          }}
          className="h-7 w-48 min-w-0 rounded-control bg-field px-2 text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:shadow-focus"
        />
        <Button
          disabled={!webPage || webPage === preferences.homepage}
          onClick={() => {
            if (!webPage) return;
            setText(webPage);
            setProblem(null);
            setWanted(false);
            update({
              homepage: webPage,
              ...(wanted ? { newPage: 'homepage' as const } : {}),
            });
          }}
        >
          Use current page
        </Button>
      </Row>
    </Section>
  );
}
