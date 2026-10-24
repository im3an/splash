import { useCallback, useRef, type ReactNode } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import type { ContentInsets, PageSnapshot } from '../../../shared/types';
import { runCommand } from '../../commands/run-command';
import { useContentInsets } from '../../hooks/use-content-insets';
import { describeError, hostOf } from '../../lib/format';
import { api } from '../../splash-api';
import {
  selectActivePage,
  selectActiveWorkspace,
  useShell,
} from '../../stores/shell-store';
import { Shortcut } from '../common/Shortcut';
import { MockPage } from './MockPage';

/**
 * The frame the active page's Chromium view is placed over. When there is no
 * page content to show, the shell renders its own surface here instead.
 */
export function ContentArea() {
  const frameRef = useRef<HTMLDivElement>(null);
  const report = useCallback(
    (insets: ContentInsets) => api().setContentInsets(insets),
    [],
  );
  useContentInsets(frameRef, report);

  return (
    <div className="min-h-0 flex-1 pr-2 pb-2 pl-2">
      <div
        ref={frameRef}
        className="relative h-full overflow-hidden rounded-[var(--radius-content)] bg-surface shadow-[var(--shadow-content)]"
      >
        <Surface />
      </div>
    </div>
  );
}

function Surface() {
  const ready = useShell((state) => state.snapshot !== null);
  const hasPages = useShell(
    (state) => (state.snapshot?.rootIds.length ?? 0) > 0,
  );
  const page = useShell(selectActivePage);

  if (!ready) return null;
  if (!hasPages || !page) return <NoPages />;
  if (page.error) return <PageFailed page={page} />;
  if (page.url === null) return <NewPage />;
  // The mock backend has no Chromium view; the shell draws the page itself.
  if (api().backend === 'mock') return <MockPage page={page} />;
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
  const workspace = useShell(selectActiveWorkspace);
  return (
    <Centered>
      <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
        {workspace ? `Start a trail in ${workspace.name}` : 'Start a trail'}
      </h1>
      <p className="mt-1.5 text-fg-muted">
        Open a page, and every page you reach from it branches beneath it in the
        sidebar.
      </p>
      <button
        type="button"
        onClick={() => void runCommand('page.new')}
        className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-elevated px-3 text-fg shadow-[var(--shadow-row)] transition-colors duration-[var(--duration-fast)] hover:bg-field-focus active:bg-pressed"
      >
        <Plus size={14} strokeWidth={1.75} />
        New page
        <Shortcut command="page.new" className="ml-1" />
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
        Press <Shortcut command="address.focus" className="text-[12px]" /> to
        jump there at any time.
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
            onClick={() => void runCommand('nav.back', { pageId: page.id })}
            className="h-8 rounded-[var(--radius-control)] px-3 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
          >
            Go back
          </button>
        )}
        <button
          type="button"
          onClick={() => void runCommand('nav.reload', { pageId: page.id })}
          className="h-8 rounded-[var(--radius-control)] bg-elevated px-3 text-fg shadow-[var(--shadow-row)] transition-colors duration-[var(--duration-fast)] hover:bg-field-focus active:bg-pressed"
        >
          Try again
        </button>
      </div>
    </Centered>
  );
}
