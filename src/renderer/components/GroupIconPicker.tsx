import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Folder, Globe } from 'lucide-react';
import type { PageGroup, PageId } from '../../shared/types';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { menuPosition } from '../lib/menu-position';
import { durationMs } from '../lib/motion';
import { api } from '../splash-api';
import { pageLabel } from '../lib/format';
import { useShell } from '../stores/shell-store';
import { WorkspaceIcon } from './WorkspaceIcon';

const COLUMNS = 7;
/** Everyday emoji, drawn by the system: Apple's own on a Mac. */
const EMOJI: readonly [value: string, label: string][] = [
  ['⭐', 'star'],
  ['❤️', 'heart'],
  ['🔥', 'fire'],
  ['✨', 'sparkles'],
  ['🎉', 'party'],
  ['💡', 'idea'],
  ['📌', 'pin'],
  ['📚', 'books'],
  ['📝', 'notes'],
  ['💼', 'work'],
  ['💻', 'laptop'],
  ['🎨', 'art'],
  ['🎬', 'film'],
  ['🎵', 'music'],
  ['🎮', 'games'],
  ['📷', 'camera'],
  ['🛒', 'shopping'],
  ['💰', 'money'],
  ['✈️', 'travel'],
  ['🏠', 'home'],
  ['🌍', 'world'],
  ['🌿', 'plant'],
  ['🌸', 'flower'],
  ['☀️', 'sun'],
  ['🌙', 'moon'],
  ['☕', 'coffee'],
  ['🍕', 'pizza'],
  ['🍎', 'apple'],
  ['🐶', 'dog'],
  ['🐱', 'cat'],
  ['🦊', 'fox'],
  ['🐎', 'horse'],
  ['🚀', 'rocket'],
  ['⚡', 'lightning'],
  ['🧪', 'lab'],
  ['🔧', 'tools'],
  ['🎓', 'study'],
  ['🏆', 'trophy'],
  ['✅', 'done'],
  ['💬', 'chat'],
  ['😀', 'smile'],
];

/** What marks a group: its emoji, or a folder until it has one. */
export function GroupMark({
  group,
  size = 16,
}: {
  group: PageGroup;
  size?: number;
}) {
  return group.icon ? (
    <WorkspaceIcon icon={group.icon} name={group.name} size={size} />
  ) : (
    <Folder size={size} fill="currentColor" aria-hidden />
  );
}

/** Picks a group's emoji, or back to a folder. */
export function GroupIconPicker({
  group,
  anchor,
  onClose,
}: {
  group: PageGroup;
  anchor: HTMLElement;
  onClose(): void;
}) {
  return (
    <EmojiPicker
      label={`Icon for ${group.name}`}
      chosen={group.icon?.value ?? null}
      none={{ label: 'folder', title: 'Folder', icon: Folder, filled: true }}
      anchor={anchor}
      onChoose={(value) =>
        void api().setGroupIcon(
          group.id,
          value ? { kind: 'emoji', value } : null,
        )
      }
      onClose={onClose}
    />
  );
}

/** Picks a trail's emoji, or back to its site's icon. */
export function TrailIconPicker({
  pageId,
  anchor,
  onClose,
}: {
  pageId: PageId;
  anchor: HTMLElement;
  onClose(): void;
}) {
  const page = useShell((state) => state.snapshot?.pages[pageId]);
  if (!page) return null;
  return (
    <EmojiPicker
      label={`Emoji for ${pageLabel(page)}`}
      chosen={page.emoji ?? null}
      none={{ label: 'site icon', title: 'Site icon', icon: Globe }}
      anchor={anchor}
      focusBack={anchor.closest<HTMLElement>('[data-page-id]') ?? anchor}
      onChoose={(value) => void api().setPageEmoji(pageId, value)}
      onClose={onClose}
    />
  );
}

/**
 * Picks an emoji, opening under the mark it changes. It stays inside the
 * sidebar: a live page view would paint over anything reaching the page.
 */
function EmojiPicker({
  label,
  chosen,
  none,
  anchor,
  focusBack = anchor,
  onChoose,
  onClose,
}: {
  label: string;
  chosen: string | null;
  /** The first choice: no emoji, and what shows instead. */
  none: {
    label: string;
    title: string;
    icon: typeof Folder;
    filled?: boolean;
  };
  anchor: HTMLElement;
  /** Takes focus when the picker is put away from the keyboard. */
  focusBack?: HTMLElement;
  onChoose(value: string | null): void;
  onClose(): void;
}) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    origin: string;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismiss = (restoreFocus: boolean) => {
    if (leaving) return;
    setLeaving(true);
    if (restoreFocus) focusBack.focus({ preventScroll: true });
    leaveTimer.current = setTimeout(onClose, durationMs('--duration-exit'));
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const rect = anchor.getBoundingClientRect();
    const sidebar = anchor.closest('aside')?.getBoundingClientRect();
    setPosition(
      menuPosition({
        x: rect.left,
        y: rect.bottom + 4,
        width: panel.offsetWidth,
        height: panel.offsetHeight,
        left: sidebar?.left ?? 0,
        right: sidebar?.right ?? window.innerWidth,
        viewportHeight: window.innerHeight,
        anchorTop: rect.top - 4,
      }),
    );
  }, [anchor, ref]);

  // Anything else the user does puts it away.
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) {
        dismiss(false);
      }
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

  const choose = (value: string | null) => {
    onChoose(value);
    dismiss(true);
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLUMNS,
      ArrowDown: COLUMNS,
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const cells = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
    ];
    const index = cells.indexOf(document.activeElement as HTMLElement);
    cells[index + step]?.focus();
  };

  // An emoji from outside the grid leaves the tab stop on the folder.
  const NoneIcon = none.icon;
  const hasStop = EMOJI.some(([value]) => value === chosen);

  return createPortal(
    <div className="contents" data-leaving={leaving}>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        inert={leaving}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            dismiss(true);
          } else onGridKey(event);
        }}
        onContextMenu={(event) => event.preventDefault()}
        className="group-icon-picker popover-in"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          // Placed before the first paint, so it's never seen unplaced.
          transformOrigin: position?.origin,
        }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!chosen}
          aria-label={none.label}
          title={none.title}
          tabIndex={hasStop ? -1 : 0}
          onClick={() => choose(null)}
          className="group-icon-choice text-fg-subtle"
        >
          <NoneIcon
            size={16}
            fill={none.filled ? 'currentColor' : 'none'}
            aria-hidden
          />
        </button>
        {EMOJI.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === chosen}
            aria-label={label}
            title={label}
            tabIndex={value === chosen ? 0 : -1}
            onClick={() => choose(value)}
            className="group-icon-choice"
          >
            <span aria-hidden>{value}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
