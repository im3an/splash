import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Lock,
  Search,
  ShieldOff,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  addressParts,
  permissionNames,
  securityOf,
  urlParts,
} from '../lib/format';
import { useInlineCompletion } from '../lib/inline-completion';
import { runPaletteItem } from '../lib/run-palette-item';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { useSuggestions } from '../stores/suggestion-store';

export function AddressBar({
  variant = 'toolbar',
  trailing,
}: {
  /** A field in the toolbar, or the pill at the top of the sidebar. */
  variant?: 'toolbar' | 'sidebar';
  /** Controls at the field's end, shown while it isn't being edited. */
  trailing?: ReactNode;
}) {
  const page = useShell(selectActivePage);
  const focusRequest = useShell((state) => state.addressFocusRequest);
  // The field moves between the toolbar and the sidebar; only a request
  // made while it's on screen focuses it, not one it mounts after.
  const handledFocus = useRef(focusRequest);
  const inputRef = useRef<HTMLInputElement>(null);
  // `null` while not editing: the field then mirrors the active page.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  // Resting on the field reveals the page's full address. The short beat
  // keeps a pointer passing over it from flickering, without feeling slow.
  const [revealed, setRevealed] = useState(false);
  const revealTimer = useRef<number | undefined>(undefined);
  const openOverlay = useOverlay((state) => state.open);
  const closeOverlay = useOverlay((state) => state.close);
  const suggesting = useOverlay(
    (state) => state.overlay?.kind === 'suggestions',
  );

  const url = page?.url ?? null;
  const inline = useInlineCompletion(inputRef, draft ?? '');
  // The latest text typed, so late answers for older text are dropped.
  const typed = useRef('');
  const searchTimer = useRef<number | undefined>(undefined);
  // The input always holds the real address; at rest a styled copy covers it.
  const value = editing ? inline.shown : (url ?? '');
  const summary = !editing && page ? addressParts(page) : null;
  const pill = variant === 'sidebar';
  const full = summary && url ? urlParts(url) : null;
  // A page that never connected has no security state worth showing.
  const security = page?.error ? 'none' : securityOf(url);
  const blocked = page?.blockedPermissions ?? [];

  useEffect(() => {
    if (focusRequest === handledFocus.current) return;
    handledFocus.current = focusRequest;
    inputRef.current?.focus();
  }, [focusRequest]);

  useEffect(
    () => () => {
      window.clearTimeout(revealTimer.current);
      window.clearTimeout(searchTimer.current);
    },
    [],
  );
  const startReveal = () => {
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setRevealed(true), 90);
  };
  const endReveal = () => {
    window.clearTimeout(revealTimer.current);
    setRevealed(false);
  };

  // Select everything once the full URL has replaced the display form.
  useLayoutEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Switching pages abandons whatever was being typed for the previous one.
  // The focus request for a new page can arrive before its snapshot, so a
  // focused field restarts from the new page's address.
  const pageId = page?.id;
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (document.activeElement !== input) {
      setDraft(null);
      return;
    }
    setDraft(url ?? '');
    requestAnimationFrame(() => input?.select());
    // Only page changes matter here; `url` is read as of that change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const stopSuggesting = () => {
    window.clearTimeout(searchTimer.current);
    typed.current = '';
    inline.clear();
    useSuggestions.getState().clear();
    if (useOverlay.getState().overlay?.kind === 'suggestions') closeOverlay();
  };

  const suggest = async (text: string, complete: boolean) => {
    if (!text.trim() || text === url) {
      stopSuggesting();
      return;
    }
    typed.current = text;
    // The engine is asked once typing pauses for a moment.
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void api()
        .suggestSearch(text)
        .then((search) => {
          if (typed.current === text && search.length > 0) {
            useSuggestions.getState().addSearch(search);
          }
        });
    }, 120);
    const items = await api().queryPalette(text, 'address', complete);
    // Ignore answers for text that has since changed or been submitted.
    if (typed.current !== text) return;
    inline.offer(items, text);
    useSuggestions.getState().setItems(items, text);
    if (items.length > 0) void openOverlay({ kind: 'suggestions' });
  };

  const finish = () => {
    stopSuggesting();
    setDraft(null);
    inputRef.current?.blur();
    api().focusPage();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const {
      items,
      selected,
      query: suggestionQuery,
    } = useSuggestions.getState();
    // A filled-in address is the leading row's: Enter goes there.
    const chosen =
      suggesting && suggestionQuery === typed.current
        ? items[selected === -1 && inline.active ? 0 : selected]
        : undefined;
    if (chosen) {
      finish();
      await runPaletteItem(chosen, 'address');
      return;
    }
    const input = (inputRef.current?.value ?? draft ?? '').trim();
    if (!input) return;
    const splash = api();
    stopSuggesting();
    if (page) await splash.navigate(page.id, input);
    else await splash.createPage(input);
    setDraft(null);
    inputRef.current?.blur();
    splash.focusPage();
  };

  return (
    <form onSubmit={submit} className="min-w-0 flex-1" role="search">
      <div
        id="address-field"
        onMouseEnter={startReveal}
        onMouseLeave={endReveal}
        data-resting={!pill && Boolean(url) && !editing && !revealed}
        data-variant={variant}
        className="group/address relative flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-field pr-1.5 pl-1 transition-[background-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-within:bg-field-focus focus-within:shadow-[var(--shadow-focus)] data-[resting=true]:bg-transparent data-[variant=sidebar]:h-9 data-[variant=sidebar]:rounded-[var(--radius-pill)] data-[variant=sidebar]:bg-pill data-[variant=sidebar]:pr-1 data-[variant=sidebar]:pl-1.5 data-[variant=sidebar]:focus-within:bg-field-focus"
      >
        <SecurityButton
          security={editing ? 'none' : security}
          tucked={!editing && !revealed}
          onOpen={() => void openOverlay({ kind: 'site-info' })}
        />
        <div className="relative flex h-full min-w-0 flex-1">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              const complete = inline.onInput(event);
              setDraft(event.target.value);
              void suggest(event.target.value, complete);
            }}
            onFocus={() => setDraft(url ?? '')}
            onBlur={() => {
              setDraft(null);
              stopSuggesting();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                // The first press takes back a filled-in address.
                if (inline.active) {
                  inline.clear();
                  useSuggestions.getState().select(-1);
                  void suggest(draft ?? '', false);
                } else finish();
              } else if (event.key === 'ArrowDown' && suggesting) {
                event.preventDefault();
                useSuggestions.getState().move(1);
              } else if (event.key === 'ArrowUp' && suggesting) {
                event.preventDefault();
                useSuggestions.getState().move(-1);
              }
            }}
            placeholder="Search or enter address"
            aria-label="Address"
            aria-autocomplete="list"
            aria-expanded={suggesting}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            data-covered={summary !== null}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle select-text data-[covered=true]:text-transparent"
          />
          {summary && (
            <div
              aria-hidden
              data-revealed={revealed && full !== null}
              className="group/summary pointer-events-none absolute inset-0 overflow-hidden text-body whitespace-nowrap"
            >
              <span className="absolute inset-0 flex items-center transition-opacity delay-[calc(var(--duration-fast)/2)] duration-[var(--duration-fast)] ease-[var(--ease-out)] group-data-[revealed=true]/summary:opacity-0 group-data-[revealed=true]/summary:delay-0">
                <span
                  className={
                    pill ? 'min-w-0 truncate text-fg' : 'shrink-0 text-fg'
                  }
                >
                  {summary.host}
                </span>
                {/* The pill sits right above the page's row; it says where. */}
                {summary.title && !pill && (
                  <span className="min-w-0 truncate text-fg-subtle">
                    <span className="px-1.5 text-fg-subtle/60">/</span>
                    {summary.title}
                  </span>
                )}
              </span>
              {full && (
                <span className="absolute inset-0 flex items-center opacity-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out)] group-data-[revealed=true]/summary:opacity-100 group-data-[revealed=true]/summary:delay-[calc(var(--duration-fast)/2)]">
                  <span className="min-w-0 truncate">
                    <span className="text-fg-subtle">{full.scheme}</span>
                    <span className="text-fg">{full.host}</span>
                    <span className="text-fg-muted">{full.rest}</span>
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        {!editing && page && blocked.length > 0 && (
          <button
            type="button"
            onClick={() => void openOverlay({ kind: 'site-info' })}
            aria-label={`Blocked: ${permissionNames(blocked)}`}
            title={`Blocked: ${permissionNames(blocked)}. Click to change.`}
            className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-inner)] text-danger hover:bg-hover"
          >
            <ShieldOff size={13} strokeWidth={2} />
          </button>
        )}
        {/* Sound stays in reach while the sidebar, and its rows, are hidden. */}
        {!editing && page && (page.isAudible || page.isMuted) && (
          <button
            type="button"
            onClick={() => void api().setMuted(page.id, !page.isMuted)}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={page.isMuted ? 'Unmute page' : 'Mute page'}
            title={`${page.isMuted ? 'Unmute page' : 'Mute page'} (⌃⌘M)`}
            data-playing={page.isAudible && !page.isMuted}
            className="press grid size-6 shrink-0 place-items-center rounded-[var(--radius-inner)] text-fg-subtle hover:bg-hover hover:text-fg data-[playing=true]:text-accent"
          >
            {page.isMuted ? (
              <VolumeX size={13} strokeWidth={2} />
            ) : (
              <Volume2 size={13} strokeWidth={2} />
            )}
          </button>
        )}
        {!editing && page && page.zoomPercent !== 100 && (
          <button
            type="button"
            onClick={() => void api().zoom(page.id, 'reset')}
            aria-label={`Zoom ${page.zoomPercent}%. Reset to 100%`}
            title="Reset zoom (⌘0)"
            className="h-6 shrink-0 rounded-[var(--radius-inner)] px-1.5 text-caption font-medium text-fg-muted tabular-nums hover:bg-hover hover:text-fg"
          >
            {page.zoomPercent}%
          </button>
        )}
        {!editing && trailing}
        <div
          className="load-indicator"
          data-active={Boolean(page?.isLoading)}
          role="progressbar"
          aria-label="Page loading"
          aria-hidden={!page?.isLoading}
        />
      </div>
    </form>
  );
}

function SecurityButton({
  security,
  tucked,
  onOpen,
}: {
  security: ReturnType<typeof securityOf>;
  /** A secure lock is the expected case, so it stays out of the way at rest. */
  tucked: boolean;
  onOpen(): void;
}) {
  if (security === 'none') {
    return (
      <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
        <Search size={13} strokeWidth={1.75} className="text-fg-subtle" />
      </span>
    );
  }
  const secure = security === 'secure';
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={
        secure
          ? 'Site settings: secure connection'
          : 'Site settings: not secure'
      }
      title="Site settings"
      // Tucked, the lock takes no room so the address sits right beside the
      // toolbar, and it slides open with the reveal; keyboard focus still
      // finds it. "Not secure" always shows.
      data-secure={secure}
      data-tucked={secure && tucked}
      className="flex h-6 shrink-0 items-center gap-1 overflow-hidden rounded-[var(--radius-inner)] px-1.5 text-fg-subtle transition-[width,margin,color,background-color,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:bg-hover hover:text-fg data-[secure=true]:w-6 data-[secure=true]:justify-center data-[secure=true]:px-0 data-[tucked=true]:-mr-1.5 data-[tucked=true]:w-0 data-[tucked=true]:opacity-0 data-[tucked=true]:focus-visible:mr-0 data-[tucked=true]:focus-visible:w-6 data-[tucked=true]:focus-visible:opacity-100"
    >
      {secure ? (
        <Lock size={12} strokeWidth={2} />
      ) : (
        <>
          <TriangleAlert size={12} strokeWidth={2} />
          <span className="text-caption text-fg-muted">Not secure</span>
        </>
      )}
    </button>
  );
}
