import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, Plus, Search } from 'lucide-react';
import type { ContentInsets, PageId, PageSnapshot } from '../../shared/types';
import { useContentInsets } from '../hooks/use-content-insets';
import { describeError, pageLabel } from '../lib/format';
import { api } from '../splash-api';
import { openLocation, useOverlay } from '../stores/overlay-store';
import {
  selectActivePage,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { Brand } from './Brand';
import { AddressSuggestions } from './AddressSuggestions';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { SiteInfoPopover } from './SiteInfoPopover';
import { WorkspaceEditor } from './WorkspaceEditor';

const PANE =
  'relative overflow-hidden rounded-[var(--radius-content)] bg-surface shadow-[var(--shadow-content)]';

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
    <div className="min-h-0 flex-1 px-[var(--gutter)] pb-[var(--gutter)]">
      {/* The page views are placed by the main process using the same gap. */}
      <div
        ref={frameRef}
        className={
          split
            ? 'relative grid h-full grid-cols-2 gap-[var(--gutter)]'
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
      </div>
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
      className={`${PANE} transition-shadow duration-[var(--duration-fast)] data-[active=true]:shadow-[var(--shadow-focus)]`}
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
          className="overlay-in absolute top-2 left-1/2 -translate-x-1/2 rounded-[var(--radius-control)] bg-elevated px-3 py-1.5 text-small text-fg-muted shadow-[var(--shadow-row)]"
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
    case 'workspace-editor':
      return <WorkspaceEditor workspaceId={overlay.workspaceId} />;
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

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[380px] text-center">{children}</div>
    </div>
  );
}

function NoPages() {
  return (
    <Centered>
      <div className="mb-6">
        <Brand size={32} />
      </div>
      <h1 className="text-title font-semibold tracking-[-0.01em]">
        Start a trail
      </h1>
      <p className="mt-1.5 text-fg-muted">
        Open a page, and every page you reach from it branches beneath it in the
        sidebar.
      </p>
      <button
        type="button"
        onClick={() => void openLocation()}
        className="button button-raised mt-5 h-8"
      >
        <Plus size={14} strokeWidth={1.75} />
        New page
        <kbd className="shortcut ml-1">⌘T</kbd>
      </button>
    </Centered>
  );
}

/** A new page with the location field dismissed: one way back to it. */
function NewPage() {
  return (
    <Centered>
      <div className="mb-6">
        <Brand size={32} />
      </div>
      <button
        type="button"
        onClick={() => void openLocation()}
        className="button button-raised h-8"
      >
        <Search size={14} strokeWidth={1.75} />
        Search or enter address
        <kbd className="shortcut ml-1">⌘L</kbd>
      </button>
    </Centered>
  );
}

function PageFailed({ page }: { page: PageSnapshot }) {
  const error = page.error!;
  const { title, detail } = describeError(error);
  return (
    <Centered>
      <CircleAlert
        size={20}
        strokeWidth={1.5}
        className="mx-auto mb-3 text-fg-subtle"
        aria-hidden
      />
      <h1 className="text-title font-semibold tracking-[-0.01em] wrap-anywhere">
        {title}
      </h1>
      <p className="mt-1.5 text-fg-muted">{detail}</p>
      {/* The specifics, for a search or a support request: never cut off. */}
      {error.url && (
        <p className="mt-4 font-mono text-caption leading-[1.6] text-fg-subtle select-text">
          <span className="block truncate" title={error.url}>
            {error.url}
          </span>
          {error.kind === 'load-failed' && (
            <span className="block wrap-anywhere">{error.description}</span>
          )}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        {page.canGoBack && (
          <button
            type="button"
            onClick={() => void api().goBack(page.id)}
            className="button h-8"
          >
            Go back
          </button>
        )}
        <button
          type="button"
          onClick={() => void api().reload(page.id)}
          className="button button-raised h-8"
        >
          Try again
        </button>
      </div>
    </Centered>
  );
}
