import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { menuPosition } from '../lib/menu-position';
import { durationMs } from '../lib/motion';

export interface MenuAction {
  kind: 'action';
  label: string;
  icon: ReactNode;
  /** Shown only where the shortcut would do the same thing. */
  shortcut?: string;
  disabled?: boolean;
  run(): void;
}

export interface MenuSubmenu {
  kind: 'submenu';
  label: string;
  icon: ReactNode;
  entries: MenuEntry[];
}

export type MenuEntry = MenuAction | MenuSubmenu | { kind: 'separator' };

const MARGIN = 6;

/** Drops separators at either end and runs of them left by hidden items. */
export function tidyEntries(entries: MenuEntry[]): MenuEntry[] {
  const tidy: MenuEntry[] = [];
  for (const entry of entries) {
    const previous = tidy.at(-1);
    if (
      entry.kind === 'separator' &&
      (!previous || previous.kind === 'separator')
    ) {
      continue;
    }
    tidy.push(entry);
  }
  if (tidy.at(-1)?.kind === 'separator') tidy.pop();
  return tidy;
}

/**
 * A menu drawn by the shell at the pointer, in place of a native one. It
 * stays inside `bounds` horizontally: a live page view would paint over any
 * part of it that reached the page. A submenu opens in place, with a way
 * back, for the same reason.
 */
export function ContextMenu({
  label,
  entries,
  x,
  y,
  bounds,
  align = 'start',
  anchorTop,
  fromKeyboard,
  returnFocus,
  onClose,
}: {
  label: string;
  entries: MenuEntry[];
  x: number;
  y: number;
  bounds: { left: number; right: number };
  align?: 'start' | 'end';
  anchorTop?: number;
  fromKeyboard: boolean;
  returnFocus: HTMLElement | null;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<MenuSubmenu | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    origin: string;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Focus follows the keyboard into a submenu; a pointer leaves it be.
  const keyboard = useRef(fromKeyboard);
  const restoreLabel = useRef<string | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const shown = tidyEntries(submenu ? submenu.entries : entries);

  const items = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );

  const dismiss = (restoreFocus: boolean) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    if (restoreFocus) returnFocus?.focus({ preventScroll: true });
    leaveTimer.current = setTimeout(onClose, durationMs('--duration-exit'));
  };

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // Opens down and to the right of the pointer, flipping where it would
  // run out of room, and keeps its place when a submenu changes its height.
  // The sidebar is rarely wide enough to flip into, so the menu mostly
  // slides left just far enough to fit.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    setPosition(
      menuPosition({
        x,
        y,
        width,
        height,
        left: bounds.left,
        right: bounds.right,
        viewportHeight: window.innerHeight,
        align,
        anchorTop,
      }),
    );
  }, [
    submenu,
    x,
    y,
    bounds.left,
    bounds.right,
    align,
    anchorTop,
    shown.length,
  ]);

  useEffect(() => {
    if (keyboard.current) {
      const target = restoreLabel.current
        ? items().find((item) => item.dataset.label === restoreLabel.current)
        : items()[0];
      target?.focus({ preventScroll: true });
      restoreLabel.current = null;
    } else ref.current?.focus();
  }, [submenu]);

  // Anything else the user does puts the menu away.
  useEffect(() => {
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) dismiss(false);
    };
    const away = () => dismiss(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', outside, true);
      window.removeEventListener('blur', away);
      window.removeEventListener('resize', away);
    };
  });

  const openSubmenu = (entry: MenuSubmenu) => setSubmenu(entry);
  const back = () => {
    restoreLabel.current = submenu?.label ?? null;
    setSubmenu(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    keyboard.current = true;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) =>
      list[(next + list.length) % list.length]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(-1);
        break;
      case 'ArrowRight':
        if (list[index]?.getAttribute('aria-haspopup')) list[index].click();
        break;
      case 'ArrowLeft':
        if (submenu) back();
        break;
      case 'Escape':
        if (submenu) back();
        else dismiss(true);
        break;
      case 'Tab':
        dismiss(true);
        break;
      default: {
        // Typing a label's first letters moves to it, as in a native menu.
        // Enter and Space fall through to the focused button.
        if (event.key.length !== 1 || event.key === ' ') return;
        if (event.metaKey || event.ctrlKey) return;
        const now = Date.now();
        const typed = typeahead.current;
        typed.text =
          (now - typed.at < 700 ? typed.text : '') + event.key.toLowerCase();
        typed.at = now;
        const labels = list.map((item) =>
          (item.dataset.label ?? '').toLowerCase(),
        );
        const start = typed.text.length === 1 ? index + 1 : Math.max(index, 0);
        for (let step = 0; step < list.length; step++) {
          const at = (start + step) % list.length;
          if (labels[at]?.startsWith(typed.text)) {
            list[at]?.focus();
            break;
          }
        }
        break;
      }
    }
    event.preventDefault();
  };

  return createPortal(
    <div className="contents" data-leaving={leaving}>
      <div
        ref={ref}
        role="menu"
        aria-label={submenu ? submenu.label : label}
        tabIndex={-1}
        inert={leaving}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        className="popover-in fixed z-50 flex w-(--menu-width) max-w-[calc(100vw-12px)] flex-col rounded-content bg-elevated p-1 text-fg shadow-panel outline-none select-none"
        style={{
          left: position?.left ?? x,
          top: position?.top ?? y,
          maxWidth: Math.max(0, bounds.right - bounds.left - 2 * MARGIN),
          maxHeight: `calc(100vh - ${2 * MARGIN}px)`,
          overflowY: 'auto',
          // Placed before the first paint, so it's never seen unplaced.
          transformOrigin: position?.origin,
        }}
      >
        {submenu && (
          <>
            <MenuRow
              icon={<ChevronLeft size={14} strokeWidth={1.75} />}
              label={submenu.label}
              muted
              onPick={back}
              onPointer={() => (keyboard.current = false)}
            />
            <div
              role="separator"
              className="mx-2 my-1 h-px shrink-0 bg-divider"
            />
          </>
        )}
        {shown.map((entry, index) =>
          entry.kind === 'separator' ? (
            <div
              key={`separator-${index}`}
              role="separator"
              className="mx-2 my-1 h-px shrink-0 bg-divider"
            />
          ) : (
            <MenuRow
              key={entry.label}
              icon={entry.icon}
              label={entry.label}
              shortcut={entry.kind === 'action' ? entry.shortcut : undefined}
              disabled={
                entry.kind === 'action'
                  ? entry.disabled
                  : entry.entries.length === 0
              }
              submenu={entry.kind === 'submenu'}
              onPointer={() => (keyboard.current = false)}
              onPick={() => {
                if (entry.kind === 'submenu') return openSubmenu(entry);
                dismiss(true);
                entry.run();
              }}
            />
          ),
        )}
      </div>
    </div>,
    document.body,
  );
}

function MenuRow({
  icon,
  label,
  shortcut,
  disabled = false,
  submenu = false,
  muted = false,
  onPick,
  onPointer,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  submenu?: boolean;
  muted?: boolean;
  onPick(): void;
  onPointer(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-haspopup={submenu ? 'menu' : undefined}
      data-label={label}
      // The row under the pointer is the highlighted one, as in AppKit.
      onPointerMove={(event) => {
        onPointer();
        if (!disabled) event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerLeave={(event) => {
        if (document.activeElement === event.currentTarget) {
          event.currentTarget.closest<HTMLElement>('[role="menu"]')?.focus();
        }
      }}
      onClick={() => {
        if (!disabled) onPick();
      }}
      className={`group/item flex h-7 w-full shrink-0 cursor-default items-center gap-2 rounded-inner px-2 text-left outline-none focus:bg-option-selected aria-disabled:opacity-40 ${muted ? 'text-fg-muted' : ''}`}
    >
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center text-fg-subtle group-focus/item:text-fg-muted"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <kbd className="shortcut">{shortcut}</kbd>}
      {submenu && (
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-fg-subtle"
        />
      )}
    </button>
  );
}
