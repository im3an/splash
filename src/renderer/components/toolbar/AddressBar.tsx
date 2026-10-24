import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Lock, Search, TriangleAlert } from 'lucide-react';
import { attempt } from '../../commands/run-command';
import { displayUrl, securityOf } from '../../lib/format';
import { api } from '../../splash-api';
import { selectActivePage, useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';

export function AddressBar() {
  const page = useShell(selectActivePage);
  const focusRequest = useUi((state) => state.addressFocusRequest);
  const inputRef = useRef<HTMLInputElement>(null);
  // `null` while not editing: the field then mirrors the active page.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const url = page?.url ?? null;
  const value = draft ?? (url ? displayUrl(url) : '');
  // A page that never connected has no security state worth showing.
  const security = page?.error ? 'none' : securityOf(url);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = (draft ?? '').trim();
    if (!input) return;
    const splash = api();
    let failed = true;
    await attempt(async () => {
      if (page) await splash.navigate(page.id, input);
      else await splash.createPage({ input });
      failed = false;
    }, 'Couldn’t open that address.');
    // Keep what was typed after a failure, so it can be corrected.
    if (failed) return;
    setDraft(null);
    inputRef.current?.blur();
    splash.focusPage();
  };

  const cancel = () => {
    setDraft(null);
    inputRef.current?.blur();
    api().focusPage();
  };

  return (
    <form onSubmit={submit} className="min-w-0 flex-1" role="search">
      <div className="relative flex h-8 items-center gap-2 rounded-[var(--radius-control)] bg-field px-2.5 transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] focus-within:bg-field-focus focus-within:shadow-[0_0_0_1px_var(--hairline),0_0_0_4px_var(--accent-soft)]">
        <SecurityIcon security={editing ? 'none' : security} />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setDraft(url ?? '')}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
          placeholder="Search or enter address"
          aria-label="Address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle select-text"
        />
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

function SecurityIcon({
  security,
}: {
  security: ReturnType<typeof securityOf>;
}) {
  if (security === 'secure') {
    return (
      <Lock
        size={12}
        strokeWidth={2}
        className="shrink-0 text-fg-subtle"
        aria-label="Secure connection"
      />
    );
  }
  if (security === 'insecure') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-fg-muted">
        <TriangleAlert size={12} strokeWidth={2} aria-hidden />
        Not secure
      </span>
    );
  }
  return (
    <Search
      size={13}
      strokeWidth={1.75}
      className="shrink-0 text-fg-subtle"
      aria-hidden
    />
  );
}
