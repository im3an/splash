import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Lock, Search, ShieldOff, TriangleAlert } from 'lucide-react';
import { displayUrl, permissionNames, securityOf } from '../lib/format';
import { runPaletteItem } from '../lib/run-palette-item';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { useSuggestions } from '../stores/suggestion-store';

export function AddressBar() {
  const page = useShell(selectActivePage);
  const focusRequest = useShell((state) => state.addressFocusRequest);
  const inputRef = useRef<HTMLInputElement>(null);
  // `null` while not editing: the field then mirrors the active page.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const openOverlay = useOverlay((state) => state.open);
  const closeOverlay = useOverlay((state) => state.close);
  const suggesting = useOverlay(
    (state) => state.overlay?.kind === 'suggestions',
  );

  const url = page?.url ?? null;
  const value = draft ?? (url ? displayUrl(url) : '');
  // A page that never connected has no security state worth showing.
  const security = page?.error ? 'none' : securityOf(url);
  const blocked = page?.blockedPermissions ?? [];

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

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
    useSuggestions.getState().clear();
    if (useOverlay.getState().overlay?.kind === 'suggestions') closeOverlay();
  };

  const suggest = async (text: string) => {
    if (!text.trim() || text === url) {
      stopSuggesting();
      return;
    }
    const items = await api().queryPalette(text, 'address');
    // Ignore answers for text that has since changed or been submitted.
    if (inputRef.current?.value !== text) return;
    useSuggestions.getState().setItems(items);
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
    const { items, selected } = useSuggestions.getState();
    const chosen = suggesting ? items[selected] : undefined;
    if (chosen) {
      finish();
      await runPaletteItem(chosen, 'address');
      return;
    }
    const input = (draft ?? '').trim();
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
        className="relative flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-field pr-1.5 pl-1 transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] focus-within:bg-field-focus focus-within:shadow-[0_0_0_1px_var(--hairline),0_0_0_4px_var(--accent-soft)]"
      >
        <SecurityButton
          security={editing ? 'none' : security}
          onOpen={() => void openOverlay({ kind: 'site-info' })}
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setDraft(event.target.value);
            void suggest(event.target.value);
          }}
          onFocus={() => setDraft(url ?? '')}
          onBlur={() => {
            setDraft(null);
            stopSuggesting();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              finish();
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
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle select-text"
        />
        {!editing && page && blocked.length > 0 && (
          <button
            type="button"
            onClick={() => void openOverlay({ kind: 'site-info' })}
            aria-label={`Blocked: ${permissionNames(blocked)}`}
            title={`Blocked: ${permissionNames(blocked)}. Click to change.`}
            className="grid size-6 shrink-0 place-items-center rounded-[5px] text-danger hover:bg-hover"
          >
            <ShieldOff size={13} strokeWidth={2} />
          </button>
        )}
        {!editing && page && page.zoomPercent !== 100 && (
          <button
            type="button"
            onClick={() => void api().zoom(page.id, 'reset')}
            aria-label={`Zoom ${page.zoomPercent}%. Reset to 100%`}
            title="Reset zoom (⌘0)"
            className="h-6 shrink-0 rounded-[5px] px-1.5 text-[11px] font-medium text-fg-muted tabular-nums hover:bg-hover hover:text-fg"
          >
            {page.zoomPercent}%
          </button>
        )}
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
  onOpen,
}: {
  security: ReturnType<typeof securityOf>;
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
      className="flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-fg-subtle transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
    >
      {secure ? (
        <Lock size={12} strokeWidth={2} />
      ) : (
        <>
          <TriangleAlert size={12} strokeWidth={2} />
          <span className="text-[11px] text-fg-muted">Not secure</span>
        </>
      )}
    </button>
  );
}
