import { create } from 'zustand';
import { offerUndo } from '../lib/trail-undo';

export interface ToastAction {
  label: string;
  /** Tooltip, e.g. the shortcut that does the same. */
  title?: string;
  icon?: 'undo';
  run(): void;
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
      action.icon === 'undo'
        ? { ...action, run: offerUndo(input.message, action.run) }
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
