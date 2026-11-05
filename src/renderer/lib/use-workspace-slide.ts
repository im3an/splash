import { useRef } from 'react';
import { useShell } from '../stores/shell-store';

/**
 * The animation class for the workspace that just became current: it slides
 * in from the side the foot's order points to. Empty on first render.
 */
export function useWorkspaceSlide(): string {
  const index = useShell(
    (state) =>
      state.snapshot?.workspaces.findIndex(
        (w) => w.id === state.snapshot?.activeWorkspaceId,
      ) ?? -1,
  );
  const previous = useRef(index);
  const slide = useRef('');
  if (previous.current !== index) {
    slide.current =
      previous.current === -1
        ? ''
        : index > previous.current
          ? 'slide-from-right'
          : 'slide-from-left';
    previous.current = index;
  }
  return slide.current;
}
