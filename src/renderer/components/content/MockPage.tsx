import { useMemo, type MouseEvent } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { PageSnapshot } from '../../../shared/types';
import { attempt } from '../../commands/run-command';
import { hostOf } from '../../lib/format';
import { describeSite, type MockLink } from '../../mock/mock-sites';
import { api } from '../../splash-api';

/**
 * Stands in for a Chromium view when the shell runs on the mock backend.
 * Links navigate in place (building back/forward history); ⌘-click or the
 * arrow opens one as a child page, as `target=_blank` does in the app.
 */
export function MockPage({ page }: { page: PageSnapshot }) {
  const url = page.url!;
  const site = useMemo(() => describeSite(url), [url]);

  if (page.isLoading) return <MockPageSkeleton host={hostOf(url)} />;

  const follow = (link: MockLink, event: MouseEvent) => {
    const asChild = event.metaKey || event.ctrlKey;
    void attempt(
      () =>
        asChild
          ? api().createPage({ input: link.url, parentId: page.id })
          : api().navigate(page.id, link.url),
      'Couldn’t follow that link.',
    );
  };

  return (
    <article className="fade-enter h-full overflow-y-auto">
      <div className="mx-auto max-w-[620px] px-10 py-12">
        <p className="font-mono text-[11px] text-fg-subtle select-text">
          {hostOf(url)}
        </p>
        <h1 className="mt-2 text-[24px] leading-tight font-semibold tracking-[-0.02em] select-text">
          {site.title}
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-fg-muted select-text">
          {site.summary}
        </p>

        {site.links.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] font-medium text-fg-subtle uppercase">
              Links
            </h2>
            <ul className="mt-2 flex flex-col gap-0.5">
              {site.links.map((link) => (
                <li key={link.url} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => follow(link, event)}
                    title={link.url}
                    className="min-w-0 flex-1 truncate rounded-[var(--radius-row)] px-2 py-1 text-left text-accent underline-offset-2 hover:bg-hover hover:underline"
                  >
                    {link.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Open ${link.label} as a child page`}
                    title="Open as child page (⌘-click)"
                    onClick={() =>
                      void attempt(
                        () =>
                          api().createPage({
                            input: link.url,
                            parentId: page.id,
                          }),
                        'Couldn’t follow that link.',
                      )
                    }
                    className="icon-button size-7 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <CornerDownRight size={14} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex flex-col gap-2.5" aria-hidden>
          {['94%', '88%', '91%', '62%'].map((width) => (
            <span
              key={width}
              className="h-2 rounded-full bg-skeleton"
              style={{ width }}
            />
          ))}
        </div>
        <p className="mt-10 text-[11px] text-fg-subtle">
          Simulated page · the shell is running without Chromium
        </p>
      </div>
    </article>
  );
}

function MockPageSkeleton({ host }: { host: string }) {
  return (
    <div
      className="mx-auto max-w-[620px] px-10 py-12"
      aria-busy="true"
      aria-label={`Loading ${host}`}
    >
      <p className="font-mono text-[11px] text-fg-subtle">{host}</p>
      <span className="skeleton mt-3 block h-6 w-3/5" />
      <span className="skeleton mt-4 block h-3 w-full" />
      <span className="skeleton mt-2 block h-3 w-4/5" />
    </div>
  );
}
