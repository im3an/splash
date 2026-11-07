import { useMemo } from 'react';
import { Route } from 'lucide-react';
import { trailSummaries } from '../../shared/trail-summary';
import type { BrowserSnapshot } from '../../shared/types';
import { pageLabel, pageParts } from '../lib/format';
import { sinceLabel } from '../lib/trail';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { Favicon } from './Favicon';
import { PanelHeader } from './PanelHeader';
import { PanelState } from './PanelState';

const NO_PAGES: BrowserSnapshot['pages'] = {};

/** Each trail in the workspace, and the page it was left on. */
export function TrailSummaryPanel() {
  const snapshot = useShell((state) => state.snapshot);
  const setPanel = useShell((state) => state.setSidebarPanel);
  const summaries = useMemo(
    () => (snapshot ? trailSummaries(snapshot) : []),
    [snapshot],
  );
  const pages = snapshot?.pages ?? NO_PAGES;
  const now = Date.now();

  return (
    <>
      <PanelHeader title="Where You Left Off" />
      {summaries.length === 0 ? (
        <PanelState
          icon={Route}
          title="No trails here yet"
          detail="Open a page, and this shows where each trail was left."
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {summaries.map((summary) => {
            const root = pages[summary.rootId];
            const left = pages[summary.leftId];
            if (!root || !left) return null;
            const on =
              summary.leftId === summary.rootId ? null : pageParts(left).title;
            const facts = [
              summary.current
                ? on
                  ? `Now on ${on}`
                  : 'On screen now'
                : on
                  ? `Left on ${on}`
                  : null,
              summary.current ? null : sinceLabel(summary.lastActiveAt, now),
              summary.pageCount > 1 ? `${summary.pageCount} pages` : null,
            ].filter(Boolean);
            return (
              <li key={summary.rootId}>
                <button
                  type="button"
                  onClick={() => {
                    setPanel(null);
                    void api()
                      .activatePage(summary.leftId)
                      .then(() => api().focusPage());
                  }}
                  title={`Show ${pageLabel(left)}`}
                  className="flex w-full items-center gap-2 rounded-row py-1.5 pr-1.5 pl-2.5 text-left transition-colors duration-fast hover:bg-row-hover"
                >
                  <Favicon page={root} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">
                      {pageParts(root).title}
                    </span>
                    <span className="block truncate text-small leading-copy text-fg-subtle">
                      {facts.join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
