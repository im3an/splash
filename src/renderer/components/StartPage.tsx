import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SavedCollection } from '../../shared/preferences';
import type { HistoryEntry, PageId, PageSnapshot } from '../../shared/types';
import { favoritesOf } from '../lib/collections';
import { pageLabel } from '../lib/format';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { Brand } from './Brand';
import { SiteIcon } from './Favicon';

const MAX_TILES = 12;
const MAX_RECENT = 8;
const NO_COLLECTIONS: SavedCollection[] = [];
const NO_PAGES: Record<PageId, PageSnapshot> = {};

function siteName(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** History worth offering: titled pages, each title once. */
export function recentPages(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      if (!entry.title || seen.has(entry.title)) return false;
      seen.add(entry.title);
      return true;
    })
    .slice(0, MAX_RECENT);
}

/**
 * What a new page shows with the Start page setting: favorites and pinned
 * pages as tiles, recent pages as a list. It's drawn by the shell while the
 * page is empty, and typing happens in the address field above it.
 */
export function StartPage({ pageId }: { pageId: PageId }) {
  const collections = useShell(
    (state) => state.preferences?.collections ?? NO_COLLECTIONS,
  );
  const pages = useShell((state) => state.snapshot?.pages ?? NO_PAGES);
  const favorites = useMemo(
    () => favoritesOf(collections).slice(0, MAX_TILES),
    [collections],
  );
  const pinned = useMemo(
    () =>
      Object.values(pages)
        .filter((page) => page.isPinned && page.url !== null)
        .slice(0, MAX_TILES),
    [pages],
  );
  const [recent, setRecent] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setFailed(false);
    void api()
      .listHistory('', MAX_RECENT * 4)
      .then((entries) => {
        if (current) setRecent(recentPages(entries));
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [pageId]);

  const open = (url: string) => {
    void api()
      .navigate(pageId, url)
      .then(() => api().focusPage());
  };
  const empty =
    favorites.length === 0 &&
    pinned.length === 0 &&
    recent !== null &&
    recent.length === 0 &&
    !failed;

  return (
    <div className="h-full overflow-y-auto" data-testid="start-page">
      <div className="mx-auto flex max-w-(--palette-width) flex-col gap-7 px-6 pt-[min(12vh,88px)] pb-8">
        <div className="flex justify-center">
          <Brand size={32} />
        </div>
        {empty && (
          <p className="text-center leading-copy text-fg-muted">
            Your bookmarks, pinned pages and recent pages will show up here.
          </p>
        )}
        {favorites.length > 0 && (
          <StartSection title="Bookmarks">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1">
              {favorites.map(({ link }) => (
                <Tile
                  key={link.id}
                  label={link.title || siteName(link.url)}
                  icon={link.faviconUrl}
                  site={link.url}
                  onOpen={() => open(link.url)}
                />
              ))}
            </div>
          </StartSection>
        )}
        {pinned.length > 0 && (
          <StartSection title="Pinned">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1">
              {pinned.map((page) => (
                <Tile
                  key={page.id}
                  label={pageLabel(page)}
                  icon={page.faviconUrl}
                  site={page.url}
                  onOpen={() => void api().activatePage(page.id)}
                />
              ))}
            </div>
          </StartSection>
        )}
        {failed && (
          <p role="alert" className="text-center text-small text-fg-muted">
            Couldn’t load your recent pages.
          </p>
        )}
        {recent !== null && recent.length > 0 && (
          <StartSection title="Recent">
            <div className="flex flex-col">
              {recent.map((entry) => (
                <button
                  key={entry.url}
                  type="button"
                  onClick={() => open(entry.url)}
                  title={entry.url}
                  className="flex h-9 items-center gap-2.5 rounded-control px-2 text-left transition-colors duration-fast outline-none hover:bg-hover focus-visible:shadow-focus"
                >
                  <SiteIcon url={entry.faviconUrl} site={entry.url} />
                  <span className="min-w-0 truncate">{entry.title}</span>
                  <span className="ml-auto shrink-0 pl-3 text-small text-fg-subtle">
                    {siteName(entry.url)}
                  </span>
                </button>
              ))}
            </div>
          </StartSection>
        )}
      </div>
    </div>
  );
}

function StartSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-2 text-caption font-medium text-fg-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Tile({
  label,
  icon,
  site,
  onOpen,
}: {
  label: string;
  icon: string | null | undefined;
  site: string | null;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-control px-1.5 py-2.5 transition-colors duration-fast outline-none hover:bg-hover focus-visible:shadow-focus"
    >
      <span className="grid size-9 place-items-center rounded-control bg-elevated shadow-row">
        <SiteIcon url={icon} site={site} />
      </span>
      <span className="w-full truncate text-center text-small text-fg-muted">
        {label}
      </span>
    </button>
  );
}
