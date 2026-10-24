import type { Rectangle } from 'electron';
import type { ContentInsets } from '../../shared/types';

/** The rectangle the active page occupies inside a window of the given size. */
export function contentBounds(
  window: { width: number; height: number },
  insets: ContentInsets,
): Rectangle {
  const x = Math.round(insets.left);
  const y = Math.round(insets.top);
  return {
    x,
    y,
    width: Math.max(0, Math.round(window.width - insets.right) - x),
    height: Math.max(0, Math.round(window.height - insets.bottom) - y),
  };
}
