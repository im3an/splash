import { create } from 'zustand';
import type { CommandId } from '../../shared/commands';
import type { PageId, WorkspaceId } from '../../shared/types';

/** What a command acts on; anything left out means "the active one". */
export interface CommandTarget {
  pageId?: PageId;
  workspaceId?: WorkspaceId;
}

export type MenuEntry =
  | {
      kind: 'command';
      command: CommandId;
      target?: CommandTarget;
      /** Overrides the command's own title for this menu. */
      label?: string;
      destructive?: boolean;
    }
  | { kind: 'separator' };

export interface ContextMenuRequest {
  /** Distinguishes successive menus so each opens fresh. */
  id?: number;
  x: number;
  y: number;
  entries: MenuEntry[];
  /** Where focus goes back to when the menu closes. */
  returnFocus: HTMLElement | null;
  /** Opened from the keyboard: start with the first item highlighted. */
  viaKeyboard?: boolean;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}

type Sheet =
  | { kind: 'confirm'; request: ConfirmRequest; resolve(ok: boolean): void }
  | { kind: 'shortcuts' };

export type Editing =
  | { kind: 'page'; id: PageId }
  | { kind: 'workspace'; id: WorkspaceId };

export interface Toast {
  id: number;
  message: string;
  tone: 'error' | 'info';
}

/** Transient shell UI state: never persisted, never sent to the backend. */
interface UiState {
  editing: Editing | null;
  contextMenu: ContextMenuRequest | null;
  sheet: Sheet | null;
  /** Element focused before the sheet opened, to return to afterwards. */
  sheetReturnFocus: HTMLElement | null;
  toasts: Toast[];
  /** Incremented to ask the address bar to take focus. */
  addressFocusRequest: number;

  startEditing(editing: Editing): void;
  stopEditing(): void;
  openContextMenu(request: ContextMenuRequest): void;
  closeContextMenu(): void;
  /** Asks the user to confirm; resolves `false` if dismissed or superseded. */
  confirm(request: ConfirmRequest): Promise<boolean>;
  showShortcuts(): void;
  closeSheet(confirmed?: boolean): void;
  notify(message: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  focusAddressBar(): void;
}

const TOAST_LIMIT = 3;
let nextToastId = 1;
let nextMenuId = 1;

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

export const useUi = create<UiState>()((set, get) => {
  const settle = (confirmed: boolean) => {
    const sheet = get().sheet;
    if (sheet?.kind === 'confirm') sheet.resolve(confirmed);
  };

  return {
    editing: null,
    contextMenu: null,
    sheet: null,
    sheetReturnFocus: null,
    toasts: [],
    addressFocusRequest: 0,

    startEditing: (editing) => set({ editing, contextMenu: null }),
    stopEditing: () => set({ editing: null }),

    openContextMenu: (request) =>
      set({ contextMenu: { ...request, id: nextMenuId++ }, editing: null }),
    closeContextMenu: () => set({ contextMenu: null }),

    confirm: (request) =>
      new Promise<boolean>((resolve) => {
        settle(false);
        set((state) => ({
          sheet: { kind: 'confirm', request, resolve },
          sheetReturnFocus: state.sheet
            ? state.sheetReturnFocus
            : activeElement(),
          contextMenu: null,
        }));
      }),

    showShortcuts: () => {
      settle(false);
      set((state) => ({
        sheet: { kind: 'shortcuts' },
        sheetReturnFocus: state.sheet
          ? state.sheetReturnFocus
          : activeElement(),
        contextMenu: null,
      }));
    },

    closeSheet: (confirmed = false) => {
      settle(confirmed);
      set({ sheet: null });
    },

    notify: (message, tone = 'error') =>
      set((state) => ({
        toasts: [
          ...state.toasts.slice(-(TOAST_LIMIT - 1)),
          { id: nextToastId++, message, tone },
        ],
      })),
    dismissToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    focusAddressBar: () =>
      set((state) => ({ addressFocusRequest: state.addressFocusRequest + 1 })),
  };
});
