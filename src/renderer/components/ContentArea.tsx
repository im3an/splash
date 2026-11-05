import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, PanelLeft, PanelRight, Plus, Search } from 'lucide-react';
import type { ContentInsets, PageId, PageSnapshot } from '../../shared/types';
import { useContentInsets } from '../hooks/use-content-insets';
import { describeError, pageLabel, pageParts } from '../lib/format';
import { api } from '../splash-api';
import { splitPartner, usePageDrag } from '../stores/drag-store';
import { openLocation, useOverlay } from '../stores/overlay-store';
import {
  selectActivePage,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { Brand } from './Brand';
import { PageState, PageStateActions } from './PanelState';
import { AddressSuggestions } from './AddressSuggestions';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { SiteInfoPopover } from './SiteInfoPopover';

const PANE =
  'relative overflow-hidden rounded-content bg-surface shadow-content';

/**
 * The frame the active page's Chromium view is placed over, or the two views
 * of a split view, side by side. When a page has no content to show, the
 * shell renders its own surface in its place instead.
 */
export function ContentArea() {
  const frameRef = useRef<HTMLDivElement>(null);
  const report = useCallback(
    (insets: ContentInsets) => api().setContentInsets(insets),
    [],
  );
  useContentInsets(frameRef, report);
  const split = useShell(selectVisibleSplit);
  const activeId = useShell((state) => state.snapshot?.activePageId ?? null);

  return (
    <div className="min-h-0 flex-1 px-(--gutter) pb-(--gutter)">
      {/* The page views are placed by the main process using the same gap. */}
      <div
        ref={frameRef}
        className={
          split
            ? 'relative grid h-full grid-cols-2 gap-(--gutter)'
            : `${PANE} h-full`
        }
      >
        {split ? (
          <>
            <SplitPane pageId={split.leftId} side="Left" />
            <SplitPane pageId={split.rightId} side="Right" />
          </>
        ) : (
          <>
            <Surface />
            {activeId && <FrozenPage pageId={activeId} />}
          </>
        )}
        <OverlayBoundary />
        <SplitDropZones />
      </div>
    </div>
  );
}

/**
 * While a page is dragged out of the trail, the page area offers its two
 * halves: drop on one to show the page there, beside the current page.
 */
function SplitDropZones() {
  const pageId = usePageDrag((state) => state.pageId);
  const target = usePageDrag((state) => state.target);
  const label = useShell((state) => {
    const page = pageId ? state.snapshot?.pages[pageId] : undefined;
    return page ? pageParts(page).title : '';
  });
  // Recomputed per render; the split and active page don't change mid-drag.
  const sides = (['left', 'right'] as const).filter(
    (side) => pageId !== null && splitPartner(pageId, side) !== null,
  );
  if (!pageId || !sides.length) return null;
  return (
    <div className="split-drop overlay-in" aria-hidden>
      {(['left', 'right'] as const).map((side) => {
        const open = sides.includes(side);
        const over = target?.kind === 'split' && target.side === side;
        return (
          <div
            key={side}
            data-drop={open ? `split-${side}` : undefined}
            data-over={over}
            data-open={open}
            className="split-drop-zone"
          >
            {open && (
              <span className="split-drop-label">
                {side === 'left' ? (
                  <PanelLeft size={16} strokeWidth={1.75} />
                ) : (
                  <PanelRight size={16} strokeWidth={1.75} />
                )}
                <span className="min-w-0 truncate">
                  {over
                    ? label
                    : `Show ${side === 'left' ? 'on the left' : 'on the right'}`}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One side of a split view. The active side carries a focus ring; clicking
 * the other side makes it active (the page view reports its own clicks).
 */
function SplitPane({ pageId, side }: { pageId: PageId; side: string }) {
  const page = useShell((state) => state.snapshot?.pages[pageId] ?? null);
  const active = useShell((state) => state.snapshot?.activePageId === pageId);
  return (
    <section
      aria-label={`${side}: ${page ? pageLabel(page) : 'page'}`}
      data-active={active}
      onPointerDown={() => {
        if (!active) void api().activatePage(pageId);
      }}
      className={`${PANE} transition-shadow duration-fast data-[active=true]:shadow-focus`}
    >
      {page && <PageSurface page={page} />}
      <FrozenPage pageId={pageId} />
    </section>
  );
}

/** A still of the page, standing in while the live view steps aside. */
function FrozenPage({ pageId }: { pageId: PageId }) {
  const still = useOverlay((state) => state.frozenPages?.[pageId] ?? null);
  if (!still) return null;
  return (
    <img
      src={still}
      alt=""
      aria-hidden
      draggable={false}
      className="absolute inset-0 size-full object-cover object-top-left"
    />
  );
}

/** A panel that fails closes itself and says so; the rest keeps working. */
function OverlayBoundary() {
  const overlay = useOverlay((state) => state.overlay);
  const [failedPanel, setFailedPanel] = useState<string | null>(null);

  useEffect(() => {
    if (!failedPanel) return;
    const timer = setTimeout(() => setFailedPanel(null), 6000);
    return () => clearTimeout(timer);
  }, [failedPanel]);

  return (
    <>
      <ErrorBoundary
        key={overlay?.kind ?? 'none'}
        onError={() => {
          setFailedPanel(overlay?.kind ?? 'panel');
          useOverlay.getState().close();
        }}
        fallback={() => null}
      >
        <OverlayHost />
      </ErrorBoundary>
      {failedPanel && (
        <p
          role="alert"
          className="overlay-in absolute top-2 left-1/2 -translate-x-1/2 rounded-control bg-elevated px-3 py-1.5 text-small text-fg-muted shadow-row"
        >
          That panel ran into a problem and was closed. Your pages are
          unaffected.
        </p>
      )}
    </>
  );
}

function OverlayHost() {
  const overlay = useOverlay((state) => state.overlay);
  const leaving = useOverlay((state) => state.leaving);
  // Overlays carry their arrival classes; this flips them to leaving.
  return (
    <div className="contents" data-leaving={leaving} inert={leaving}>
      <OverlayContent overlay={overlay} />
    </div>
  );
}

function OverlayContent({
  overlay,
}: {
  overlay: ReturnType<typeof useOverlay.getState>['overlay'];
}) {
  switch (overlay?.kind) {
    case 'palette':
      return <CommandPalette scope={overlay.scope} />;
    case 'suggestions':
      return <AddressSuggestions />;
    case 'site-info':
      return <SiteInfoPopover />;
    default:
      return null;
  }
}

function Surface() {
  const ready = useShell((state) => state.snapshot !== null);
  const hasPages = useShell(
    (state) => (state.snapshot?.rootIds.length ?? 0) > 0,
  );
  const page = useShell(selectActivePage);
  // The palette is the whole screen there; an empty state behind it is noise.
  const locating = useOverlay((state) => state.overlay?.kind === 'palette');

  if (!ready) return null;
  if (locating && (!page || (page.url === null && !page.error))) return null;
  if (!hasPages || !page) return <NoPages />;
  return <PageSurface page={page} />;
}

/** What the shell shows for a page whose own view can't cover its area. */
function PageSurface({ page }: { page: PageSnapshot }) {
  if (page.error) return <PageFailed page={page} />;
  if (page.url === null) return <NewPage />;
  // The page's own view covers this area.
  return null;
}

function NoPages() {
  return (
    <PageState
      lead={<Brand size={32} />}
      title="Start a trail"
      detail="Open a page, and every page you reach from it branches beneath it in the sidebar."
    >
      <PageStateActions>
        <button
          type="button"
          onClick={() => void openLocation()}
          className="button button-raised button-lg"
        >
          <Plus size={14} strokeWidth={1.75} />
          New page
          <kbd className="shortcut ml-1">⌘T</kbd>
        </button>
      </PageStateActions>
    </PageState>
  );
}

/** A new page with the location field dismissed: one way back to it. */
function NewPage() {
  return (
    <PageState lead={<Brand size={32} />}>
      <button
        type="button"
        onClick={() => void openLocation()}
        className="button button-raised button-lg"
      >
        <Search size={14} strokeWidth={1.75} />
        Search or enter address
        <kbd className="shortcut ml-1">⌘L</kbd>
      </button>
    </PageState>
  );
}

function PageFailed({ page }: { page: PageSnapshot }) {
  const error = page.error!;
  const { title, detail } = describeError(error);
  return (
    <PageState
      role="alert"
      lead={
        <CircleAlert
          size={20}
          strokeWidth={1.5}
          className="text-fg-subtle"
          aria-hidden
        />
      }
      title={title}
      detail={detail}
    >
      {/* The specifics, for a search or a support request: never cut off. */}
      {error.url && (
        <p className="mt-4 font-mono text-caption leading-loose text-fg-subtle select-text">
          <span className="block truncate" title={error.url}>
            {error.url}
          </span>
          {error.kind !== 'crashed' && (
            <span className="block wrap-anywhere">{error.description}</span>
          )}
        </p>
      )}
      <PageStateActions>
        {page.canGoBack && (
          <button
            type="button"
            onClick={() => void api().goBack(page.id)}
            className="button button-lg"
          >
            Go back
          </button>
        )}
        {error.kind === 'no-secure-connection' && (
          <button
            type="button"
            onClick={() => void api().continueOverHttp(page.id)}
            className="button button-lg"
          >
            Continue with HTTP
          </button>
        )}
        <button
          type="button"
          onClick={() => void api().reload(page.id)}
          className="button button-raised button-lg"
        >
          Try again
        </button>
      </PageStateActions>
    </PageState>
  );
}
