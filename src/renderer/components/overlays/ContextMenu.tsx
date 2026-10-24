import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { specOf } from '../../../shared/commands';
import { isCommandEnabled, runCommand } from '../../commands/run-command';
import { useShell } from '../../stores/shell-store';
import {
  useUi,
  type ContextMenuRequest,
  type MenuEntry,
} from '../../stores/ui-store';
import { shortcutLabel } from '../common/Shortcut';

const EDGE = 6;

export function ContextMenu() {
  const request = useUi((state) => state.contextMenu);
  if (!request) return null;
  return createPortal(
    <Menu key={request.id} request={request} />,
    document.body,
  );
}

type ResolvedEntry =
  | {
      kind: 'command';
      entry: Extract<MenuEntry, { kind: 'command' }>;
      label: string;
      shortcut: string | null;
      enabled: boolean;
    }
  | { kind: 'separator' };

function Menu({ request }: { request: ContextMenuRequest }) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Re-evaluated as the browser changes underneath (e.g. a load finishing).
  const snapshot = useShell((state) => state.snapshot);
  const entries = useMemo<ResolvedEntry[]>(
    () =>
      request.entries.map((entry) =>
        entry.kind === 'separator'
          ? entry
          : {
              kind: 'command',
              entry,
              label: entry.label ?? specOf(entry.command).title,
              shortcut: shortcutLabel(entry.command),
              enabled: isCommandEnabled(entry.command, entry.target),
            },
      ),
    // `snapshot` is what enabled-ness depends on.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [request, snapshot],
  );
  const enabledIndexes = entries.flatMap((entry, index) =>
    entry.kind === 'command' && entry.enabled ? [index] : [],
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    request.viaKeyboard ? (enabledIndexes[0] ?? -1) : -1,
  );
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const close = (restoreFocus = true) => {
    useUi.getState().closeContextMenu();
    const target = request.returnFocus;
    if (restoreFocus && target?.isConnected) target.focus();
  };

  // Keep the menu inside the sidebar horizontally (in the app, the content
  // area belongs to the page view) and inside the window vertically.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const sidebar = document
      .querySelector('[data-sidebar]')
      ?.getBoundingClientRect();
    const right =
      sidebar && sidebar.width > 0 ? sidebar.right : window.innerWidth;
    const left = Math.max(EDGE, Math.min(request.x, right - width - EDGE));
    const fitsBelow = request.y + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? request.y : Math.max(EDGE, request.y - height);
    setPosition({ left, top });
  }, [request]);

  // Only once positioned: a `visibility: hidden` element can't take focus.
  const positioned = position !== null;
  useLayoutEffect(() => {
    if (positioned) menuRef.current?.focus({ preventScroll: true });
  }, [positioned]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    const dismissNow = () => close(false);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', dismissNow, true);
    window.addEventListener('blur', dismissNow);
    window.addEventListener('resize', dismissNow);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('scroll', dismissNow, true);
      window.removeEventListener('blur', dismissNow);
      window.removeEventListener('resize', dismissNow);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (index: number) => {
    const entry = entries[index];
    if (entry?.kind !== 'command' || !entry.enabled) return;
    // Close and restore focus first, so whatever the command focuses wins.
    close();
    void runCommand(entry.entry.command, entry.entry.target);
  };

  const step = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(activeIndex);
    const next =
      current === -1
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (current + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]!);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    switch (event.key) {
      case 'ArrowDown':
        step(1);
        break;
      case 'ArrowUp':
        step(-1);
        break;
      case 'Home':
        setActiveIndex(enabledIndexes[0] ?? -1);
        break;
      case 'End':
        setActiveIndex(enabledIndexes.at(-1) ?? -1);
        break;
      case 'Enter':
      case ' ':
        choose(activeIndex);
        break;
      case 'Escape':
        close();
        break;
      case 'Tab':
        close();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Actions"
      tabIndex={-1}
      aria-activedescendant={
        activeIndex >= 0 ? `menu-item-${request.id}-${activeIndex}` : undefined
      }
      onKeyDown={onKeyDown}
      onPointerLeave={() => setActiveIndex(-1)}
      onContextMenu={(event) => event.preventDefault()}
      className="popover-enter fixed z-50 min-w-[200px] max-w-[236px] rounded-[var(--radius-popover)] bg-elevated p-1 text-[13px] shadow-[var(--shadow-popover)] outline-none"
      style={{
        left: position?.left ?? request.x,
        top: position?.top ?? request.y,
        visibility: position ? 'visible' : 'hidden',
        transformOrigin: 'top left',
      }}
    >
      {entries.map((entry, index) =>
        entry.kind === 'separator' ? (
          <div
            key={`separator-${index}`}
            role="separator"
            className="mx-2 my-1 h-px bg-divider"
          />
        ) : (
          <div
            key={`${entry.entry.command}-${index}`}
            id={`menu-item-${request.id}-${index}`}
            role="menuitem"
            aria-label={entry.label}
            aria-disabled={!entry.enabled}
            data-active={index === activeIndex}
            data-destructive={entry.entry.destructive ?? false}
            onPointerMove={() => entry.enabled && setActiveIndex(index)}
            onClick={() => choose(index)}
            className="flex h-[26px] items-center gap-4 rounded-[5px] px-2 text-fg aria-disabled:text-fg-subtle data-[active=true]:bg-accent data-[active=true]:text-accent-fg data-[destructive=true]:text-danger data-[destructive=true]:data-[active=true]:bg-danger data-[destructive=true]:data-[active=true]:text-accent-fg"
          >
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && (
              <kbd className="font-sans text-[11px] opacity-60">
                {entry.shortcut}
              </kbd>
            )}
          </div>
        ),
      )}
    </div>
  );
}
