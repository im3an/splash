import { useEffect, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import type { ImportResult, ImportSource } from '../../shared/types';
import { api } from '../splash-api';
import { Button, Row, Section } from './controls';

function Checkbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-small text-fg-muted">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function SourceRow({
  source,
  busy,
  onImport,
}: {
  source: ImportSource;
  busy: boolean;
  onImport(what: { bookmarks: boolean; history: boolean }): void;
}) {
  const [bookmarks, setBookmarks] = useState(source.hasBookmarks);
  const [history, setHistory] = useState(source.hasHistory);
  return (
    <Row
      label={
        source.profile ? `${source.browser}: ${source.profile}` : source.browser
      }
      help={
        source.blocked
          ? 'macOS keeps other apps out of its folder. In Safari, choose File > Export Browsing Data, then import that file below.'
          : undefined
      }
    >
      {!source.blocked && (
        <>
          <Checkbox
            label="Bookmarks"
            checked={bookmarks}
            disabled={!source.hasBookmarks}
            onChange={setBookmarks}
          />
          <Checkbox
            label="History"
            checked={history}
            disabled={!source.hasHistory}
            onChange={setHistory}
          />
          <Button
            disabled={busy || (!bookmarks && !history)}
            onClick={() => onImport({ bookmarks, history })}
          >
            Import
          </Button>
        </>
      )}
    </Row>
  );
}

/** What came in, and the way to take it back. */
function ImportOutcome({
  result,
  onChange,
}: {
  result: ImportResult;
  onChange(next: ImportResult | null): void;
}) {
  const say = (summary: string): ImportResult => ({
    summary,
    details: [],
    undoToken: null,
    trashToken: null,
  });
  return (
    <div role="status" className="flex flex-col gap-2 px-4 py-3">
      <p className="font-medium">{result.summary}</p>
      {result.details.map((detail) => (
        <p key={detail} className="text-small leading-copy text-fg-muted">
          {detail}
        </p>
      ))}
      {(result.undoToken || result.trashToken) && (
        <div className="mt-1 flex gap-2">
          {result.undoToken && (
            <Button
              onClick={() => {
                void api()
                  .undoImport(result.undoToken!)
                  .then((undone) =>
                    onChange(
                      undone
                        ? say('Removed what was imported.')
                        : say('Too late to undo that import.'),
                    ),
                  );
              }}
            >
              <Undo2 size={13} />
              Undo Import
            </Button>
          )}
          {result.trashToken && (
            <Button
              onClick={() => {
                void api()
                  .trashImportedFile(result.trashToken!)
                  .then((moved) =>
                    onChange({
                      ...result,
                      trashToken: null,
                      details: [
                        moved
                          ? 'Moved the passwords file to the Trash.'
                          : 'The file couldn’t be moved to the Trash. Delete it yourself: its passwords aren’t protected.',
                      ],
                    }),
                  );
              }}
            >
              <Trash2 size={13} />
              Move File to Trash
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Bringing things in from other browsers, and taking them out again. */
export function TransferSettings() {
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void api().importSources().then(setSources);
  }, []);

  const run = async (work: () => Promise<ImportResult | null>) => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await work();
      if (outcome) setResult(outcome);
    } catch (error) {
      setResult({
        summary: 'That couldn’t be imported.',
        details: [error instanceof Error ? error.message : String(error)],
        undoToken: null,
        trashToken: null,
      });
    } finally {
      setBusy(false);
    }
  };

  const save = async (work: () => Promise<string | null>) => {
    setSaved(null);
    const filename = await work();
    if (filename) setSaved(`Saved “${filename}”.`);
  };

  return (
    <>
      <Section
        title="Import from a browser"
        description="Adds to what you have and skips anything already here. Bookmarks go in a folder of their own. The browser can stay open."
      >
        {sources?.length === 0 && (
          <Row
            label="No other browsers found on this Mac"
            help="You can still import a file exported from one."
          />
        )}
        {sources?.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            busy={busy}
            onImport={(what) =>
              void run(() => api().importFrom(source.id, what))
            }
          />
        ))}
        {result && <ImportOutcome result={result} onChange={setResult} />}
      </Section>

      <Section
        title="Import from a file"
        description="Browsers keep saved passwords where other apps can’t read them, so those come by way of an exported file."
      >
        <Row
          label="Bookmarks, history or passwords"
          help="A bookmarks file (.html, .json), a Safari export (.zip) or a passwords file (.csv)."
        >
          <Button
            disabled={busy}
            onClick={() => void run(() => api().importFile())}
          >
            Choose File…
          </Button>
        </Row>
      </Section>

      <Section title="Export">
        <Row label="Bookmarks" help="An HTML file that any browser can import.">
          <Button onClick={() => void save(() => api().exportBookmarks())}>
            Export…
          </Button>
        </Row>
        {saved && (
          <p role="status" className="px-4 py-2.5 text-small text-fg-muted">
            {saved}
          </p>
        )}
      </Section>
    </>
  );
}
