import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Puzzle,
  Settings2,
  Share,
  Sparkles,
  Star,
  House,
} from 'lucide-react';
import {
  DEFAULT_PREFERENCES,
  TOOLBAR_ACTIONS,
  type ToolbarAction,
} from '../../shared/preferences';
import { api } from '../splash-api';
import {
  collectionNotice,
  saveToolbar,
  toggleBookmark,
} from '../lib/collections';
import {
  selectActivePage,
  selectAddressInSidebar,
  useShell,
} from '../stores/shell-store';
import { useAiPanel } from '../stores/ai-store';
import { useOverlay } from '../stores/overlay-store';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { ExtensionActions } from './ExtensionActions';
import { PrivateChip } from './PrivateChip';
import { SplitButton } from './Toolbar';
import { DownloadsButton } from './DownloadsButton';
import { NotesButton } from './notes/NotesButton';

export const toolbarLabels: Record<ToolbarAction, string> = {
  bookmark: 'Bookmark',
  share: 'Share',
  extensions: 'Extensions',
  split: 'Split view',
  downloads: 'Downloads',
  home: 'Home',
};
export function ToolbarActions() {
  const aiOpen = useAiPanel((state) => state.open);
  const page = useShell(selectActivePage);
  const preferences = useShell((state) => state.preferences);
  const inSidebar = useShell(selectAddressInSidebar);
  const actions =
    preferences?.toolbarActions ?? DEFAULT_PREFERENCES.toolbarActions;
  const saved = preferences?.collections?.some(
    (item) =>
      item.kind === 'folder' &&
      item.links.some((link) => link.url === page?.url),
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    element: HTMLElement;
    keyboard: boolean;
    anchored: boolean;
    top?: number;
    serial: number;
  } | null>(null);
  const menuSerial = useRef(0);
  const [menuReady, setMenuReady] = useState(false);
  useEffect(() => {
    setMenuReady(false);
    if (!menu) return;
    let cancelled = false;
    void useOverlay
      .getState()
      .open({ kind: 'toolbar-menu' })
      .then(() => {
        if (!cancelled) setMenuReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMenu(null);
          collectionNotice('Could not open toolbar menu. Try again.');
        }
      });
    return () => {
      cancelled = true;
      if (
        !useOverlay.getState().overlay ||
        useOverlay.getState().overlay?.kind === 'toolbar-menu'
      )
        useOverlay.getState().close();
    };
  }, [menu]);
  const [busy, setBusy] = useState<'bookmark' | 'share' | null>(null);
  const busyRef = useRef(false);
  const web = Boolean(page?.url && /^https?:\/\//i.test(page.url));
  const entries: MenuEntry[] = [
    ...TOOLBAR_ACTIONS.map((action) => ({
      kind: 'action' as const,
      label: `${actions.includes(action) ? 'Hide' : 'Show'} ${toolbarLabels[action]}`,
      icon: actions.includes(action) ? <Check size={14} /> : null,
      run: () =>
        saveToolbar({
          toolbarActions: actions.includes(action)
            ? actions.filter((item) => item !== action)
            : [...actions, action],
        }),
    })),
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Manage Extensions…',
      icon: <Puzzle size={14} />,
      run: () => {
        void api()
          .manageExtensions()
          .catch(() =>
            collectionNotice(
              'Extensions are unavailable. Restart Splash and try again.',
            ),
          );
      },
    },
    {
      kind: 'action',
      label: 'Toolbar Settings…',
      icon: <Settings2 size={14} />,
      run: () => {
        void api().openSettings();
      },
    },
    {
      kind: 'action',
      label: 'Reset Toolbar',
      icon: null,
      run: () =>
        saveToolbar({ toolbarActions: DEFAULT_PREFERENCES.toolbarActions }),
    },
  ];
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({
          x: event.clientX,
          y: event.clientY,
          element:
            (event.target instanceof Element
              ? event.target.closest<HTMLElement>('button')
              : null) ?? event.currentTarget,
          keyboard: event.clientX === 0 && event.clientY === 0,
          anchored: false,
          serial: ++menuSerial.current,
        });
      }}
    >
      <PrivateChip />
      {actions.map((action) => {
        if (action === 'extensions') return <ExtensionActions key={action} />;
        if (action === 'split') return <SplitButton key={action} compact />;
        if (action === 'downloads')
          return <DownloadsButton key={action} always />;
        if (action === 'home')
          return (
            <button
              key={action}
              type="button"
              className="icon-button"
              aria-label="Go to homepage"
              title={
                preferences?.homepage
                  ? 'Go to homepage (⇧⌘H)'
                  : 'Choose a homepage in Settings'
              }
              onClick={() => void api().goHome()}
            >
              <House size={16} />
            </button>
          );
        return (
          <button
            key={action}
            type="button"
            className="icon-button"
            disabled={!web || busy !== null}
            aria-busy={busy === action || undefined}
            aria-label={
              action === 'bookmark'
                ? saved
                  ? 'Remove from Bookmarks'
                  : 'Add to Bookmarks'
                : 'Share page'
            }
            aria-pressed={action === 'bookmark' ? Boolean(saved) : undefined}
            title={
              action === 'bookmark'
                ? saved
                  ? 'Remove from Bookmarks'
                  : 'Add to Bookmarks'
                : 'Share page'
            }
            onClick={() => {
              if (!page || busyRef.current) return;
              busyRef.current = true;
              setBusy(action);
              const operation =
                action === 'bookmark'
                  ? toggleBookmark(page)
                  : api().sharePage(page.id);
              void operation
                .catch(() =>
                  collectionNotice(
                    'Could not complete this action. Try again.',
                  ),
                )
                .finally(() => {
                  busyRef.current = false;
                  setBusy(null);
                });
            }}
          >
            {action === 'bookmark' ? (
              <Star
                size={16}
                fill={saved ? 'currentColor' : 'none'}
                className={saved ? 'text-accent' : ''}
              />
            ) : (
              <Share size={16} />
            )}
          </button>
        );
      })}
      {/*
       * Not pinned: it still comes up while a download needs following. The
       * sidebar's narrow row has no room for it, so there it sits a row above.
       */}
      {!actions.includes('downloads') && !inSidebar && <DownloadsButton />}
      <NotesButton />
      <button
        type="button"
        className="icon-button data-[on=true]:text-accent"
        aria-label="AI panel"
        aria-pressed={aiOpen}
        data-on={aiOpen}
        title={aiOpen ? 'Close AI panel (⇧⌘A)' : 'Ask AI (⇧⌘A)'}
        onClick={() => useAiPanel.getState().toggle()}
      >
        <Sparkles size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Customize toolbar"
        title="Customize toolbar"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({
            x: rect.right,
            y: rect.bottom,
            element: event.currentTarget,
            keyboard: event.detail === 0,
            anchored: true,
            serial: ++menuSerial.current,
            top: rect.top,
          });
        }}
      >
        <Settings2 size={16} />
      </button>
      {menu && menuReady && (
        <ContextMenu
          key={menu.serial}
          label="Customize toolbar"
          entries={entries}
          x={menu.x}
          y={menu.y}
          bounds={{ left: 0, right: window.innerWidth }}
          align={menu.anchored ? 'end' : 'start'}
          anchorTop={menu.top}
          fromKeyboard={menu.keyboard}
          returnFocus={menu.element}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
