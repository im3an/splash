import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { create } from 'zustand';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { collectionNotice } from '../lib/collections';
import { SiteIcon } from './Favicon';
import { Reveal } from './Reveal';

type Link = SavedCollection['links'][number];

/**
 * Which stack has popped its list open. One at a time, so the pages below
 * move at most one list's height: the trail stays the way around.
 */
export const useOpenStack = create<{ id: string | null }>()(() => ({
  id: null,
}));

export function toggleStack(id: string) {
  useOpenStack.setState((state) => ({ id: state.id === id ? null : id }));
}

/**
 * Up to three site icons on cards, fanned like a hand of them. They spread
 * on hover and fly apart when the list pops open.
 */
export function StackedIcons({
  links,
  fallback,
}: {
  links: Link[];
  fallback?: ReactNode;
}) {
  const shown = links.slice(0, 3);
  return (
    <span className="stacked-icons" aria-hidden data-count={shown.length}>
      {shown.length
        ? shown.map((link) => (
            <span key={link.id} className="stacked-icon">
              <SiteIcon url={link.faviconUrl} />
            </span>
          ))
        : fallback && <span className="stacked-icon">{fallback}</span>}
    </span>
  );
}

/**
 * A row standing for a set of links: its icon stack, name and count. A
 * click pops the links out beneath it as a list, each one sliding out of
 * the stack in turn; another click, Escape or a click elsewhere puts them
 * back.
 */
export function IconStack({
  id,
  name,
  links,
  label,
  menuOpen,
  onMenu,
  fallback,
  renderName,
  children,
  footer,
  rowProps,
}: {
  id: string;
  name: string;
  links: Link[];
  /** What the row is, for screen readers ("Saved group", "Favorites"). */
  label: string;
  menuOpen: boolean;
  onMenu?(event: MouseEvent<HTMLElement>, anchored?: boolean): void;
  fallback?: ReactNode;
  /** In place of the name, e.g. a field to rename it. */
  renderName?: ReactNode;
  /** The list, when open. */
  children: ReactNode;
  footer?: ReactNode;
  rowProps?: Record<string, unknown>;
}) {
  const open = useOpenStack((state) => state.id === id);
  const ref = useRef<HTMLDivElement>(null);
  const count = links.length;

  // A click anywhere else closes it, like a popover.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node))
        useOpenStack.setState({ id: null });
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  return (
    <div
      ref={ref}
      className="icon-stack"
      data-open={open}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          useOpenStack.setState({ id: null });
          ref.current?.querySelector<HTMLElement>('.sidebar-row-main')?.focus();
        }
      }}
    >
      <div
        className="sidebar-row group"
        data-menu-open={menuOpen}
        onContextMenu={onMenu ? (event) => onMenu(event) : undefined}
        {...rowProps}
      >
        {renderName ? (
          <span className="sidebar-row-main">
            <StackedIcons links={links} fallback={fallback} />
            {renderName}
          </span>
        ) : (
          <button
            type="button"
            className="sidebar-row-main"
            aria-expanded={open}
            aria-label={`${name}, ${label}, ${count} ${count === 1 ? 'page' : 'pages'}`}
            onClick={() => toggleStack(id)}
          >
            <StackedIcons links={links} fallback={fallback} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <ChevronRight
              size={12}
              strokeWidth={2}
              aria-hidden
              className="icon-stack-chevron"
            />
            <span className="sidebar-row-count">{count}</span>
          </button>
        )}
        {onMenu && !renderName && (
          <button
            type="button"
            data-stack={id}
            aria-label={`Actions for ${name}`}
            title="Actions"
            aria-haspopup="menu"
            onClick={(event) => onMenu(event, true)}
            className="sidebar-row-more"
          >
            <MoreHorizontal size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <Reveal show={open}>
        <div className="icon-stack-list" role="group" aria-label={name}>
          {children}
          {footer}
        </div>
      </Reveal>
    </div>
  );
}

/**
 * One link in a popped-out list. `index` staggers its entrance, so the
 * list deals itself out of the stack from the top.
 */
export function StackLink({
  link,
  index,
  current,
  onOpen,
  onMenu,
  menuOpen,
  dragProps,
  style,
}: {
  link: Link;
  index: number;
  current?: boolean;
  onOpen(fresh: boolean): void;
  onMenu?(event: MouseEvent<HTMLElement>): void;
  menuOpen?: boolean;
  dragProps?: Record<string, unknown>;
  style?: CSSProperties;
}) {
  const title = link.title || hostOf(link.url);
  return (
    <button
      type="button"
      {...dragProps}
      className="stack-link"
      data-current={current}
      data-menu-open={menuOpen}
      aria-current={current ? 'page' : undefined}
      title={`${title}\n${link.url}`}
      style={{ ...style, '--i': Math.min(index, 12) } as CSSProperties}
      onClick={(event) => onOpen(event.metaKey)}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen(true);
      }}
      onContextMenu={onMenu}
    >
      <span className="stack-link-icon">
        <SiteIcon url={link.faviconUrl} />
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="stack-link-host">
        {hostOf(link.url).replace(/^www\./, '')}
      </span>
    </button>
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Shows the open copy of a link, or opens it as a new page. */
export async function openLink(link: Link, fresh: boolean) {
  const snapshot = useShell.getState().snapshot;
  const existing =
    !fresh && snapshot
      ? Object.values(snapshot.pages).find((page) => page.url === link.url)
      : undefined;
  try {
    if (existing) await api().activatePage(existing.id);
    else await api().createPage(link.url);
  } catch {
    collectionNotice('Could not open that page. Try again.');
  }
}
