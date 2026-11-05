import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  CookieDeletion,
  CookieEntry,
  CookieSite,
} from '../../shared/types';
import { formatCookieExpiry } from '../lib/format';
import { api } from '../splash-api';
import { Button, Row, Section } from './controls';

/** Below this many sites a filter only gets in the way. */
const FILTER_FROM = 6;

function cookieKey(cookie: CookieEntry): string {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`;
}

/** What sites keep on this Mac, by site, with a way to delete it. */
export function CookieSettings() {
  const [sites, setSites] = useState<CookieSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [undo, setUndo] = useState<{
    summary: string;
    token: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSites(await api().listCookies());
    } catch {
      setError('Couldn’t read cookies. Try again.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
    } catch {
      setError('Couldn’t change cookies. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (site: string, only?: CookieEntry) =>
    act(async () => {
      const result: CookieDeletion = await api().deleteCookies(
        site,
        only && { name: only.name, domain: only.domain, path: only.path },
      );
      setUndo({
        summary: only
          ? `Deleted “${only.name}” from ${site}.`
          : `Deleted ${result.deleted === 1 ? 'a cookie' : `${result.deleted} cookies`} from ${site}.`,
        token: result.undoToken,
      });
    });

  const restore = (token: string) =>
    act(async () => {
      const restored = await api().undoDeleteCookies(token);
      setUndo({
        summary: restored
          ? 'The cookies are back.'
          : 'Too late to undo; the cookies are gone.',
        token: null,
      });
    });

  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    return words ? sites?.filter(({ site }) => site.includes(words)) : sites;
  }, [sites, filter]);

  const total = sites?.reduce((sum, site) => sum + site.cookies.length, 0) ?? 0;

  return (
    <Section
      title="Cookies"
      description={
        sites && sites.length > 0
          ? `${total === 1 ? 'A cookie' : `${total} cookies`} from ${sites.length === 1 ? 'one site' : `${sites.length} sites`}. Deleting them signs you out of those sites.`
          : 'What sites keep on this Mac to remember you.'
      }
    >
      {error && sites === null ? (
        <Row label="Cookies unavailable" help={error}>
          <Button onClick={() => void load()}>Try again</Button>
        </Row>
      ) : sites === null ? (
        <div className="h-12" aria-busy="true" />
      ) : sites.length === 0 ? (
        <Row label="No cookies" help="Sites you visit may add some." />
      ) : (
        <>
          {sites.length >= FILTER_FROM && (
            <div className="px-4 py-2.5">
              <input
                type="search"
                aria-label="Filter sites"
                placeholder="Filter sites"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-7 w-full rounded-control bg-field px-2 text-small text-fg"
              />
            </div>
          )}
          <div className="max-h-96 divide-y divide-divider overflow-y-auto">
            {shown?.map(({ site, cookies }) => (
              <div key={site}>
                <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
                  <button
                    type="button"
                    aria-expanded={open === site}
                    onClick={() => setOpen(open === site ? null : site)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <ChevronRight
                      size={13}
                      aria-hidden
                      className={`shrink-0 text-fg-subtle ${open === site ? 'rotate-90' : ''}`}
                    />
                    <span className="truncate">{site}</span>
                    <span className="shrink-0 text-small text-fg-subtle">
                      {cookies.length}
                    </span>
                  </button>
                  <Button
                    disabled={busy}
                    aria-label={`Delete cookies from ${site}`}
                    onClick={() => void remove(site)}
                  >
                    Delete
                  </Button>
                </div>
                {open === site && (
                  <ul className="flex flex-col gap-0.5 pb-2 pl-9 pr-4">
                    {cookies.map((cookie) => (
                      <li
                        key={cookieKey(cookie)}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-small">
                            {cookie.name}
                          </span>
                          <span className="block truncate text-caption text-fg-subtle">
                            {cookie.domain}
                            {cookie.path === '/' ? '' : cookie.path} ·{' '}
                            {formatCookieExpiry(cookie.expires)}
                            {cookie.httpOnly ? ' · Hidden from scripts' : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete ${cookie.name} from ${site}`}
                          onClick={() => void remove(site, cookie)}
                          className="button button-sm shrink-0"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {shown?.length === 0 && <Row label="No matching sites" />}
          </div>
        </>
      )}
      {(undo || (error && sites !== null)) && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <p
            role={error ? 'alert' : 'status'}
            className={`min-w-0 text-small ${error ? 'text-danger' : 'text-fg-muted'}`}
          >
            {error ?? undo?.summary}
          </p>
          {!error && undo?.token && (
            <Button disabled={busy} onClick={() => void restore(undo.token!)}>
              Undo
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}
