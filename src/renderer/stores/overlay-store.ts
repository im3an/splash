import { create } from 'zustand';
import type { PaletteScope } from '../../shared/palette';
import type { PageId } from '../../shared/types';
import { durationMs } from '../lib/motion';
import { api } from '../splash-api';

/** Shell surfaces drawn over the page area. */
export type Overlay =
  | { kind: 'palette'; scope: PaletteScope }
  | { kind: 'toolbar-menu' }
  | { kind: 'bookmarks-menu' }
  | { kind: 'suggestions' }
  | { kind: 'site-info' }
  | { kind: 'downloads' }
  | { kind: 'notes' }
  /** PROTOTYPE: see src/renderer/prototype/. */
  | { kind: 'alma-view' };

interface OverlayState {
  overlay: Overlay | null;
  /** The overlay is animating out; it's gone once the exit finishes. */
  leaving: boolean;
  /** Stills of the pages on screen, shown in their place while an overlay is open. */
  frozenPages: Record<PageId, string> | null;
  open(overlay: Overlay): Promise<void>;
  close(): void;
}

let requestSerial = 0;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A page that has never painted, like the blank one a link to a file leaves,
 * never answers a capture. A hung one may not either. Neither has a still worth
 * waiting for, and the overlay shouldn't depend on it.
 */
const CAPTURE_PATIENCE_MS = 400;

const captureStills = () =>
  Promise.race([
    api().freezePage(),
    new Promise<Record<PageId, string>>((resolve) =>
      setTimeout(() => resolve({}), CAPTURE_PATIENCE_MS),
    ),
  ]);

/**
 * A live page view always paints above the shell, so overlays work by
 * freezing: the shell shows a still of the page, then the view steps aside
 * until the overlay closes.
 */
export const useOverlay = create<OverlayState>()((set, get) => ({
  overlay: null,
  leaving: false,
  frozenPages: null,
  open: async (overlay) => {
    const request = ++requestSerial;
    if (get().overlay) {
      // Opening again mid-exit keeps the page stepped aside.
      clearTimeout(leaveTimer);
      set({ overlay, leaving: false });
      return;
    }
    const stills = await captureStills();
    if (request !== requestSerial) return;
    set({ overlay, frozenPages: stills });
    // Let the still paint before the live view leaves.
    await nextFrame();
    await nextFrame();
    if (get().overlay) api().setOverlayActive(true);
  },
  close: () => {
    requestSerial++;
    if (!get().overlay || get().leaving) return;
    // The overlay animates out over the still; the live page comes back
    // only once it has gone, since the page would paint over the exit.
    set({ leaving: true });
    leaveTimer = setTimeout(() => {
      api().setOverlayActive(false);
      set({ overlay: null, leaving: false });
      // Keep the still a moment so the returning view covers it seamlessly.
      setTimeout(() => {
        if (!get().overlay) set({ frozenPages: null });
      }, 120);
    }, durationMs('--duration-exit'));
  },
}));
