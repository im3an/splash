import { create } from 'zustand';
import type { WorkspaceId } from '../../shared/types';
import { api } from '../splash-api';

/** Shell surfaces drawn over the page area. */
export type Overlay =
  | { kind: 'palette' }
  | { kind: 'suggestions' }
  | { kind: 'site-info' }
  | { kind: 'workspace-editor'; workspaceId: WorkspaceId | null };

interface OverlayState {
  overlay: Overlay | null;
  /** A still of the page, shown in its place while an overlay is open. */
  frozenPage: string | null;
  open(overlay: Overlay): Promise<void>;
  close(): void;
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A live page view always paints above the shell, so overlays work by
 * freezing: the shell shows a still of the page, then the view steps aside
 * until the overlay closes.
 */
export const useOverlay = create<OverlayState>()((set, get) => ({
  overlay: null,
  frozenPage: null,
  open: async (overlay) => {
    if (get().overlay) {
      set({ overlay });
      return;
    }
    const still = await api().freezePage();
    set({ overlay, frozenPage: still });
    // Let the still paint before the live view leaves.
    await nextFrame();
    await nextFrame();
    if (get().overlay) api().setOverlayActive(true);
  },
  close: () => {
    if (!get().overlay) return;
    api().setOverlayActive(false);
    set({ overlay: null });
    // Keep the still a moment so the returning view covers it seamlessly.
    setTimeout(() => {
      if (!get().overlay) set({ frozenPage: null });
    }, 120);
  },
}));
