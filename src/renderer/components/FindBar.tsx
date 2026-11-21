import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from '../icons';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';
import { Reveal } from './Reveal';

/** ⌘F: find on the active page. Enter and ⌘G step forward, ⇧ steps back. */
export function FindBar() {
  const open = useShell((state) => state.findOpen);
  const request = useShell((state) => state.findRequest);
  const closeFind = useShell((state) => state.closeFind);
  const page = useShell(selectActivePage);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pageId = page?.id;

  const search = (forward: boolean, findNext: boolean) => {
    if (pageId) void api().find(pageId, text, { forward, findNext });
  };

  // Menu commands: open focuses the field, next/previous step through matches.
  useEffect(() => {
    if (!open || request.serial === 0) return;
    if (request.action === 'open') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (text) {
      search(request.action === 'next', true);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [request.serial]);

  // A different page starts a fresh search.
  useEffect(() => {
    if (open && text && pageId) {
      void api().find(pageId, text, { forward: true, findNext: false });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  if (!open) return <Reveal show={false}>{null}</Reveal>;

  const close = () => {
    if (pageId) void api().stopFind(pageId);
    closeFind();
    api().focusPage();
  };
  const result = page?.find;
  const status = !text
    ? ''
    : !result
      ? ''
      : result.matches === 0
        ? 'No matches'
        : `${result.activeMatch} of ${result.matches}`;

  return (
    <Reveal show>
      <div
        role="search"
        aria-label="Find on page"
        className="shell-bar gap-1 self-end py-1 pr-1 pl-2.5"
      >
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (pageId) {
              void api().find(pageId, event.target.value, {
                forward: true,
                findNext: false,
              });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              search(!event.shiftKey, true);
            }
          }}
          placeholder="Find on page"
          aria-label="Find on page"
          spellCheck={false}
          className="h-7 w-56 min-w-0 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
        />
        <span
          aria-live="polite"
          className="min-w-[72px] shrink-0 text-right text-small text-fg-subtle tabular-nums"
        >
          {status}
        </span>
        <button
          type="button"
          className="icon-button size-7"
          aria-label="Previous match"
          title="Previous match (⇧⌘G)"
          disabled={!result?.matches}
          onClick={() => search(false, true)}
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          className="icon-button size-7"
          aria-label="Next match"
          title="Next match (⌘G)"
          disabled={!result?.matches}
          onClick={() => search(true, true)}
        >
          <ChevronDown size={15} />
        </button>
        <button
          type="button"
          className="icon-button size-7"
          aria-label="Close find"
          title="Close (esc)"
          onClick={close}
        >
          <X size={14} />
        </button>
      </div>
    </Reveal>
  );
}
