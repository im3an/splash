import type { MouseEvent } from 'react';
import { create } from 'zustand';
import type { PageId } from '../../shared/types';

export interface PageMenuRequest {
  pageId: PageId;
  /** Where the menu opens, in window coordinates. */
  x: number;
  y: number;
  /** Opened from the keyboard: the first item takes focus. */
  fromKeyboard: boolean;
  /** Gets focus back when the menu is dismissed. */
  returnFocus: HTMLElement | null;
}

interface PageMenuState {
  menu: PageMenuRequest | null;
  /** Counts menus opened, so a new one replaces the last outright. */
  serial: number;
  open(menu: PageMenuRequest): void;
  /** Closes `menu` if it's still the one open. */
  close(menu: PageMenuRequest): void;
}

export const usePageMenu = create<PageMenuState>()((set) => ({
  menu: null,
  serial: 0,
  open: (menu) => set((state) => ({ menu, serial: state.serial + 1 })),
  close: (menu) =>
    set((state) => (state.menu === menu ? { menu: null } : state)),
}));

/**
 * Opens a page's menu at the pointer, or under the row when the menu key
 * opened it (Chromium reports no position then).
 */
export function openPageMenu(
  pageId: PageId,
  event: MouseEvent<HTMLElement>,
): void {
  const row = event.currentTarget;
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  const rect = row.getBoundingClientRect();
  usePageMenu.getState().open({
    pageId,
    x: fromKeyboard ? rect.left + 24 : event.clientX,
    y: fromKeyboard ? rect.bottom : event.clientY,
    fromKeyboard,
    returnFocus: row,
  });
}
