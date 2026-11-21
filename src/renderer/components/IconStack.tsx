import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { ChevronRight } from '../icons';
import type { SavedCollection } from '../../shared/preferences';
import { api } from '../splash-api';
import {
  selectFlatTrail,
  selectMinimalTrail,
  useShell,
} from '../stores/shell-store';
import { collectionNotice } from '../lib/collections';
import { rowBox } from '../lib/trail-rows';
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
export function StackedIcons({ links }: { links: Link[] }) {
  const shown = links.slice(0, 3);
  return (
    <span className="stacked-icons" aria-hidden data-count={shown.length}>
      {shown.map((link) => (
        <span key={link.id} className="stacked-icon">
          <SiteIcon url={link.faviconUrl} site={link.url} />
        </span>
      ))}
    </span>
  );
}

/** A branch's chevron, in the column the trail keeps for it. */
export function RowChevron({
  open,
  minimal,
}: {
  open: boolean;
  minimal: boolean;
}) {
  return (
    <span
      aria-hidden
      className="trail-branch-toggle -mx-0.5 grid size-5 shrink-0 place-items-center text-fg-subtle"
    >
      <ChevronRight
        size={minimal ? 13 : 12}
        className="transition-transform duration-base ease-emphasized"
        style={{ transform: open ? 'rotate(90deg)' : undefined }}
      />
    </span>
  );
}

/**
 * A row standing for a set of links, laid out like a page with a branch
 * under it: chevron, icon stack, name and, while folded, how many. A click
 * pops the links out beneath it as a list, each one sliding out of the stack
 * in turn; another click, Escape or a click elsewhere puts them back.
 */
export function IconStack({
  id,
  name,
  links,
  children,
}: {
  id: string;
  name: string;
  links: Link[];
  /** The list, when open. */
  children: ReactNode;
}) {
  const open = useOpenStack((state) => state.id === id);
  const flat = useShell(selectFlatTrail);
  const minimal = useShell(selectMinimalTrail);
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
      <div className="sidebar-row group">
        <button
          type="button"
          className="sidebar-row-main"
          aria-expanded={open}
          aria-label={`${name}, ${count} ${count === 1 ? 'page' : 'pages'}`}
          style={{ paddingLeft: rowBox(0, flat, minimal).paddingLeft }}
          onClick={() => toggleStack(id)}
        >
          {!flat && <RowChevron open={open} minimal={minimal} />}
          <StackedIcons links={links} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {flat && <RowChevron open={open} minimal={minimal} />}
          {!open && (
            <span className="shrink-0 text-caption text-fg-subtle tabular-nums">
              {count}
            </span>
          )}
        </button>
      </div>
      <Reveal show={open}>
        <div className="icon-stack-list" role="group" aria-label={name}>
          {children}
        </div>
      </Reveal>
    </div>
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
