import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import type { ContentInsets, PageId, PageSnapshot } from '../../shared/types';
import { useContentInsets } from '../hooks/use-content-insets';
import { describeError, hostOf, pageLabel } from '../lib/format';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import {
  selectActivePage,
  selectVisibleSplit,
  useShell,
} from '../stores/shell-store';
import { AddressSuggestions } from './AddressSuggestions';
import { CommandPalette } from './CommandPalette';
import { DownloadsPanel } from './DownloadsPanel';
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
    <div className="min-h-0 flex-1 pr-2 pb-2 pl-2">
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
          className="overlay-in absolute top-2 left-1/2 -translate-x-1/2 rounded-[var(--radius-control)] bg-elevated px-3 py-1.5 text-[12px] text-fg-muted shadow-[var(--shadow-row)]"
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
  switch (overlay?.kind) {
    case 'palette':
      return <CommandPalette />;
    case 'suggestions':
      return <AddressSuggestions />;
    case 'site-info':
      return <SiteInfoPopover />;
    case 'downloads':
      return <DownloadsPanel />;
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

  if (!ready) return null;
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
  const focusAddressBar = useShell((state) => state.focusAddressBar);
  const newPage = async () => {
    await api().createPage();
    focusAddressBar();
  };
  return (
    <Centered>
      <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
        Start a trail
      </h1>
      <p className="mt-1.5 text-fg-muted">
        Open a page, and every page you reach from it branches beneath it in the
        sidebar.
      </p>
      <button
        type="button"
        onClick={newPage}
        className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-elevated px-3 text-fg shadow-[var(--shadow-row)] transition-colors duration-[var(--duration-fast)] hover:bg-field-focus active:bg-pressed"
      >
        <Plus size={14} strokeWidth={1.75} />
        New page
        <kbd className="ml-1 font-sans text-[11px] text-fg-subtle">⌘T</kbd>
      </button>
    </Centered>
  );
}

function NewPage() {
  return (
    <Centered>
      <p className="text-fg-muted">
        Type an address or a search in the bar above.
      </p>
      <p className="mt-1 text-[12px] text-fg-subtle">
        Press <kbd className="font-sans">⌘L</kbd> to jump there at any time.
      </p>
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
      <h1 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="mt-1.5 text-fg-muted">{detail}</p>
      {error.url && (
        <p className="mt-3 truncate font-mono text-[11px] text-fg-subtle select-text">
          {hostOf(error.url)}
          {error.kind === 'load-failed' && ` · ${error.description}`}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        {page.canGoBack && (
          <button
            type="button"
            onClick={() => void api().goBack(page.id)}
            className="h-8 rounded-[var(--radius-control)] px-3 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
          >
            Go back
          </button>
        )}
        <button
          type="button"
          onClick={() => void api().reload(page.id)}
          className="h-8 rounded-[var(--radius-control)] bg-elevated px-3 text-fg shadow-[var(--shadow-row)] transition-colors duration-[var(--duration-fast)] hover:bg-field-focus active:bg-pressed"
        >
          Try again
        </button>
      </div>
    </Centered>
  );
}
