import { create } from 'zustand';
import {
  offerUndo,
  redoLast,
  undoLast,
  type UndoResult,
  type UndoStep,
} from '../lib/trail-undo';

export interface ToastAction {
  label: string;
  /** Tooltip, e.g. the shortcut that does the same. */
  title?: string;
  icon?: 'undo' | 'redo';
  run: UndoStep;
  /** With the `undo` icon: how to do the change again after undoing it. */
  redo?: UndoStep;
  /** It runs what's already in the undo history rather than adding to it. */
  inHistory?: boolean;
}

export interface Toast {
  id: number;
  message: string;
  /** A quieter second part, such as the shortcut that also undoes it. */
  detail: string | null;
  actions: ToastAction[];
  durationMs: number;
  /** Set for "Closed …" toasts: the close they offer to undo. */
  closedSerial?: number;
}

export type ToastInput = Omit<Toast, 'id'>;

interface ToastState {
  /** One toast at a time; a newer one replaces it. */
  toast: Toast | null;
  show(toast: ToastInput): void;
  dismiss(id: number): void;
  /** Keeps the toast up while the pointer rests on it. */
  hold(held: boolean): void;
}

let nextId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleDismiss(toast: Toast): void {
  clearTimeout(timer);
  timer = setTimeout(
    () => useToast.getState().dismiss(toast.id),
    toast.durationMs,
  );
}

export const useToast = create<ToastState>()((set, get) => ({
  toast: null,
  show: (input) => {
    // Undo stays available to ⌘Z after the toast goes.
    const actions = input.actions.map((action) =>
      action.icon === 'undo' && !action.inHistory
        ? (() => {
            const undo = offerUndo(input.message, action.run, action.redo);
            return { ...action, run: () => undo().then(confirmUndo) };
          })()
        : action,
    );
    const toast = { ...input, actions, id: ++nextId };
    set({ toast });
    scheduleDismiss(toast);
  },
  dismiss: (id) => {
    if (get().toast?.id !== id) return;
    clearTimeout(timer);
    set({ toast: null });
  },
  hold: (held) => {
    const { toast } = get();
    if (!toast) return;
    if (held) clearTimeout(timer);
    else scheduleDismiss(toast);
  },
}));

/** The toast offers a step through the undo history. */
export function offersUndoHistory(toast: Toast | null): boolean {
  return !!toast?.actions.some(
    (action) => action.icon === 'undo' || action.icon === 'redo',
  );
}

const UNDONE_MS = 7000;

/** Says what ⌘Z, ⇧⌘Z or a toast's button just did, and offers the way back. */
export function confirmUndo({ kind, label, canRedo }: UndoResult): void {
  const { show } = useToast.getState();
  switch (kind) {
    case 'nothing':
      return;
    case 'undone':
      return show({
        message: `Undid: ${label}`,
        detail: canRedo ? '⇧⌘Z redoes it.' : null,
        durationMs: UNDONE_MS,
        actions: canRedo
          ? [
              {
                label: 'Redo',
                icon: 'redo',
                run: () => redoLast().then(confirmUndo),
              },
            ]
          : [],
      });
    case 'redone':
      return show({
        message: label,
        detail: '⌘Z undoes it.',
        durationMs: UNDONE_MS,
        actions: [
          {
            label: 'Undo',
            icon: 'undo',
            inHistory: true,
            run: () => undoLast().then(confirmUndo),
          },
        ],
      });
    case 'undo-failed':
    case 'redo-failed':
      return show({
        message: `Couldn’t ${kind === 'undo-failed' ? 'undo' : 'redo'}: ${label}`,
        detail: 'It may have changed since.',
        durationMs: UNDONE_MS,
        actions: [],
      });
  }
}
