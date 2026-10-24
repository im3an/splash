import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';
import { commandIds, specOf, type CommandId } from '../../../shared/commands';
import { useShell } from '../../stores/shell-store';
import { useUi, type ConfirmRequest } from '../../stores/ui-store';
import { shortcutLabel } from '../common/Shortcut';
import { rowElement } from '../tree/TrailRow';

/**
 * A modal panel that rises from the bottom of the sidebar, used for
 * confirmations and the shortcut list. Focus is held inside it and returned
 * to where it was when it closes.
 */
export function SidebarSheet() {
  const sheet = useUi((state) => state.sheet);
  if (!sheet) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <div
        className="fade-enter absolute inset-0 bg-scrim"
        onClick={() => useUi.getState().closeSheet(false)}
      />
      {sheet.kind === 'confirm' ? (
        <ConfirmSheet request={sheet.request} />
      ) : (
        <ShortcutsSheet />
      )}
    </div>
  );
}

/** Puts focus back where it came from, or on the active page's row. */
function restoreFocus() {
  const target = useUi.getState().sheetReturnFocus;
  requestAnimationFrame(() => {
    if (target?.isConnected) {
      target.focus();
      return;
    }
    const activeId = useShell.getState().snapshot?.activePageId;
    if (activeId) rowElement(activeId)?.focus();
  });
}

function Panel({
  role,
  labelId,
  descriptionId,
  initialFocus,
  className = '',
  children,
}: {
  role: 'dialog' | 'alertdialog';
  labelId: string;
  descriptionId?: string;
  initialFocus: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initialFocus.current?.focus();
    return restoreFocus;
  }, [initialFocus]);

  // Escape dismisses; Tab cycles within the panel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      useUi.getState().closeSheet(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={panelRef}
      role={role}
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onKeyDown={onKeyDown}
      className={`sheet-enter relative m-2 rounded-[var(--radius-popover)] bg-elevated p-3 shadow-[var(--shadow-popover)] ${className}`}
    >
      {children}
    </div>
  );
}

function ConfirmSheet({ request }: { request: ConfirmRequest }) {
  const titleId = useId();
  const messageId = useId();
  // Destructive actions start on Cancel, so a stray Return is harmless.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const close = useUi((state) => state.closeSheet);

  return (
    <Panel
      role="alertdialog"
      labelId={titleId}
      descriptionId={messageId}
      initialFocus={request.destructive ? cancelRef : confirmRef}
    >
      <h2
        id={titleId}
        className="font-semibold tracking-[-0.005em] break-words"
      >
        {request.title}
      </h2>
      <p
        id={messageId}
        className="mt-1 text-[12px] leading-[1.45] text-fg-muted"
      >
        {request.message}
      </p>
      <div className="mt-3 flex justify-end gap-1.5">
        <button
          ref={cancelRef}
          type="button"
          onClick={() => close(false)}
          className="h-7 rounded-[var(--radius-control)] px-2.5 text-fg-muted transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg"
        >
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => close(true)}
          data-destructive={request.destructive ?? false}
          className="h-7 rounded-[var(--radius-control)] bg-accent px-2.5 font-medium text-accent-fg transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 active:brightness-95 data-[destructive=true]:bg-danger"
        >
          {request.confirmLabel}
        </button>
      </div>
    </Panel>
  );
}

const GROUPS: { title: string; prefix: string[] }[] = [
  { title: 'Pages', prefix: ['page.'] },
  { title: 'Navigation', prefix: ['nav.', 'address.'] },
  { title: 'Workspaces', prefix: ['workspace.'] },
  { title: 'View', prefix: ['sidebar.', 'help.'] },
];

/** Keys handled by the focused sidebar tree rather than by commands. */
const TREE_KEYS: [string, string][] = [
  ['↑ ↓', 'Move between pages'],
  ['← →', 'Collapse or expand'],
  ['Return', 'Open page'],
  ['⌫', 'Close page'],
  ['⇧⌫', 'Close page and children'],
];

function ShortcutsSheet() {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useUi((state) => state.closeSheet);

  const rows = (prefixes: string[]) =>
    commandIds.filter(
      (id) =>
        prefixes.some((prefix) => id.startsWith(prefix)) &&
        !/select-[2-9]$/.test(id) &&
        specOf(id).shortcut,
    );
  const labelFor = (id: CommandId) =>
    id === 'workspace.select-1'
      ? 'Switch to workspace 1–9'
      : specOf(id).title.replace('…', '');
  const keysFor = (id: CommandId) =>
    id === 'workspace.select-1'
      ? `${shortcutLabel(id)}–9`
      : (shortcutLabel(id) ?? '');

  return (
    <Panel
      role="dialog"
      labelId={titleId}
      initialFocus={closeRef}
      className="flex max-h-[calc(100%-64px)] flex-col p-0!"
    >
      <div className="flex shrink-0 items-center justify-between py-2 pr-1.5 pl-3">
        <h2 id={titleId} className="font-semibold">
          Keyboard shortcuts
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="icon-button size-6"
          aria-label="Close"
          onClick={() => close(false)}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div
        className="min-h-0 overflow-y-auto px-3 pb-3 text-[12px]"
        tabIndex={0}
        aria-label="Shortcut list"
      >
        {GROUPS.map((group) => (
          <section key={group.title} className="mt-2 first:mt-0">
            <h3 className="mb-1 text-[11px] font-medium text-fg-subtle uppercase">
              {group.title}
            </h3>
            <dl>
              {rows(group.prefix).map((id) => (
                <ShortcutRow key={id} label={labelFor(id)} keys={keysFor(id)} />
              ))}
            </dl>
          </section>
        ))}
        <section className="mt-2">
          <h3 className="mb-1 text-[11px] font-medium text-fg-subtle uppercase">
            In the sidebar
          </h3>
          <dl>
            {TREE_KEYS.map(([keys, label]) => (
              <ShortcutRow key={label} label={label} keys={keys} />
            ))}
            <ShortcutRow label="Rename" keys="Double-click" />
            <ShortcutRow label="Reorder or nest" keys="Drag" />
          </dl>
        </section>
      </div>
    </Panel>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex h-6 items-center gap-3">
      <dt className="min-w-0 flex-1 truncate text-fg-muted">{label}</dt>
      <dd className="shrink-0 font-sans text-fg">{keys}</dd>
    </div>
  );
}
