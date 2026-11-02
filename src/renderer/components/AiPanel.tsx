import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CircleAlert,
  ExternalLink,
  RotateCw,
  X,
} from 'lucide-react';
import {
  AI_PROVIDERS,
  aiProvider,
  type AiProvider,
  type AiProviderId,
} from '../../shared/ai';
import type { ContentInsets } from '../../shared/types';
import { useContentInsets } from '../hooks/use-content-insets';
import { collectionNotice } from '../lib/collections';
import { api } from '../splash-api';
import { useAiPanel } from '../stores/ai-store';
import { useShell } from '../stores/shell-store';
import { SiteIcon } from './Favicon';

const MIN = 320;
const MAX = 720;
const DEFAULT_WIDTH = 420;

/**
 * An assistant beside the page, the way the sidebar sits on the other side:
 * Claude, ChatGPT, Perplexity, Gemini or Le Chat, each its own web app,
 * signed in like any page. Links it gives open as pages in the trail.
 */
export function AiPanel() {
  const open = useAiPanel((state) => state.open);
  const saved = useShell(
    (state) => state.preferences?.aiPanelWidth ?? DEFAULT_WIDTH,
  );
  const [draft, setDraft] = useState<number | null>(null);
  const width = draft ?? saved;

  return (
    <aside
      aria-label="AI panel"
      aria-hidden={!open}
      inert={!open}
      className="relative shrink-0 overflow-hidden transition-[width] duration-slow ease-emphasized data-[resizing=true]:transition-none"
      data-resizing={draft !== null}
      style={{ width: open ? width : 0 }}
    >
      {/* Keeps its width while the panel closes, so nothing reflows. */}
      <div className="flex h-full flex-col pr-(--gutter)" style={{ width }}>
        {open && <PanelBody />}
      </div>
      {open && <PanelResize saved={saved} draft={draft} setDraft={setDraft} />}
    </aside>
  );
}

function PanelBody() {
  const provider = useShell(
    (state) => state.preferences?.aiProvider ?? 'claude',
  );
  const state = useAiPanel((store) => store.state);
  const current = state?.provider === provider ? state : null;
  const frameRef = useRef<HTMLDivElement>(null);
  const failed = current?.failed ?? false;

  // The assistant's view goes where the frame is; it steps aside while it
  // has failed, so the shell's message shows instead.
  const report = useCallback(
    (insets: ContentInsets) => {
      if (!failed) api().placeAiPanel({ provider, insets });
    },
    [provider, failed],
  );
  useContentInsets(frameRef, report);
  useEffect(() => {
    if (failed) api().placeAiPanel(null);
  }, [failed]);
  useEffect(() => () => api().placeAiPanel(null), []);

  const choose = (id: AiProviderId) => {
    if (id === provider) return;
    void api()
      .updatePreferences({ aiProvider: id })
      .catch(() => collectionNotice('Could not switch assistants. Try again.'));
  };

  return (
    <>
      <header className="drag flex h-(--toolbar-height) shrink-0 items-center gap-1 pl-1">
        <div
          role="radiogroup"
          aria-label="Assistant"
          className="flex min-w-0 items-center gap-0.5"
        >
          {AI_PROVIDERS.map((option) => (
            <ProviderButton
              key={option.id}
              provider={option}
              selected={option.id === provider}
              icon={state?.icons[option.id]}
              onSelect={() => choose(option.id)}
            />
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5">
          {current?.canGoBack && (
            <button
              type="button"
              className="icon-button"
              aria-label="Back"
              title="Back"
              onClick={() => void api().actOnAiPanel('back')}
            >
              <ArrowLeft size={15} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Open as a page"
            title="Open this conversation as a page"
            onClick={() => void api().actOnAiPanel('open-as-page')}
          >
            <ExternalLink size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close AI panel"
            title="Close AI panel (⇧⌘A)"
            onClick={() => useAiPanel.getState().close()}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>
      <div
        ref={frameRef}
        className="ai-frame relative mb-(--gutter) min-h-0 flex-1 overflow-hidden rounded-content bg-surface shadow-content"
        data-loading={!current || current.isLoading}
      >
        {failed ? (
          <div
            role="alert"
            className="grid h-full place-content-center justify-items-center gap-3 p-6 text-center"
          >
            <CircleAlert
              size={20}
              strokeWidth={1.5}
              className="text-fg-subtle"
              aria-hidden
            />
            <p className="text-fg">
              {aiProvider(provider).name} couldn’t be reached
            </p>
            <p className="max-w-64 text-small leading-copy text-fg-subtle">
              Check your connection, then try again.
            </p>
            <button
              type="button"
              className="button button-raised"
              onClick={() => void api().actOnAiPanel('reload')}
            >
              <RotateCw size={13} strokeWidth={1.75} />
              Try again
            </button>
          </div>
        ) : (
          // Under the assistant's view until its first paint.
          <div className="ai-loading" aria-hidden>
            <ProviderMark
              provider={aiProvider(provider)}
              icon={state?.icons[provider]}
              large
            />
          </div>
        )}
      </div>
    </>
  );
}

function ProviderButton({
  provider,
  selected,
  icon,
  onSelect,
}: {
  provider: AiProvider;
  selected: boolean;
  icon: string | undefined;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={provider.name}
      title={provider.name}
      onClick={onSelect}
      data-selected={selected}
      className="ai-provider"
    >
      <ProviderMark provider={provider} icon={icon} />
      <span className="ai-provider-name">{provider.name}</span>
    </button>
  );
}

/** The assistant's own icon once seen, its favicon before, a letter if neither. */
function ProviderMark({
  provider,
  icon,
  large = false,
}: {
  provider: AiProvider;
  icon: string | undefined;
  large?: boolean;
}) {
  const fallback = `${new URL(provider.url).origin}/favicon.ico`;
  return (
    <span className="ai-provider-mark" data-large={large}>
      <SiteIcon
        url={icon ?? fallback}
        fallback={
          <span className="favorite-monogram">{provider.name.charAt(0)}</span>
        }
      />
    </span>
  );
}

function PanelResize({
  saved,
  draft,
  setDraft,
}: {
  saved: number;
  draft: number | null;
  setDraft(width: number | null): void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const latest = useRef(saved);
  const clamp = (width: number) =>
    Math.round(Math.min(MAX, Math.max(MIN, width)));
  const save = (width: number) => {
    void api()
      .updatePreferences({ aiPanelWidth: width })
      .then(() => setDraft(null))
      .catch(() => {
        setDraft(null);
        collectionNotice('Could not save the panel width. Try again.');
      });
  };
  return (
    <div
      role="separator"
      aria-label="AI panel width"
      aria-orientation="vertical"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={draft ?? saved}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className="sidebar-resize ai-resize"
      data-resizing={draft !== null}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { x: event.clientX, width: saved };
        latest.current = saved;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        // Dragging left widens a panel on the right.
        latest.current = clamp(
          start.current.width - (event.clientX - start.current.x),
        );
        setDraft(latest.current);
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        save(latest.current);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
      onDoubleClick={() => save(DEFAULT_WIDTH)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        save(clamp((draft ?? saved) + (event.key === 'ArrowLeft' ? 20 : -20)));
      }}
    />
  );
}
