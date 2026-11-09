import { create } from 'zustand';
import { useDragging } from '../stores/drag-store';
import { useShell } from '../stores/shell-store';
import { Favorites } from './Favorites';

/** The group whose name is being edited in place, if any. */
export const useGroupRename = create<{ id: string | null }>()(() => ({
  id: null,
}));

/**
 * Saved: Favorites, above the trail and set apart from it by a wavy line.
 * Groups live in the trail itself, as sets of ordinary pages.
 */
export function SavedGroups() {
  const hasFavorites = useShell((state) =>
    (state.preferences?.collections ?? []).some(
      (item) => item.kind === 'folder' && item.links.length > 0,
    ),
  );
  const dragging = useDragging();
  if (!hasFavorites && !dragging) return null;

  return (
    <section className="saved-groups" aria-label="Saved">
      <Favorites />
      <Squiggle />
    </section>
  );
}

/** A hand-drawn-looking rule: one wave repeated across the sidebar's width. */
function Squiggle() {
  return (
    <div className="saved-squiggle" aria-hidden>
      <svg width="100%" height="8">
        <defs>
          <pattern
            id="saved-squiggle-wave"
            width="12"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            {/* Runs past the tile on both sides, so its joins don't show. */}
            <path
              d="M-6 4 Q-3 8 0 4 T6 4 T12 4 T18 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill="url(#saved-squiggle-wave)" />
      </svg>
    </div>
  );
}
