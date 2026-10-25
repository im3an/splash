import { create } from 'zustand';
import type { PageId, WorkspaceId } from '../../shared/types';
import { api } from '../splash-api';

/** Shell surfaces drawn over the page area. */
export type Overlay =
  | { kind: 'palette' }
  | { kind: 'suggestions' }
  | { kind: 'site-info' }
  | { kind: 'downloads' }
  | { kind: 'workspace-editor'; workspaceId: WorkspaceId | null };

interface OverlayState {
  overlay: Overlay | null;
  /** Stills of the pages on screen, shown in their place while an overlay is open. */
  frozenPages: Record<PageId, string> | null;
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
  frozenPages: null,
  open: async (overlay) => {
    if (get().overlay) {
      set({ overlay });
      return;
    }
    const stills = await api().freezePage();
    set({ overlay, frozenPages: stills });
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
      if (!get().overlay) set({ frozenPages: null });
    }, 120);
  },
}));
