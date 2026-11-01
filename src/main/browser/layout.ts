import type { Rectangle } from 'electron';
import type { ContentInsets } from '../../shared/types';
import { SPLIT_GAP } from '../../shared/geometry';

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

export { SPLIT_GAP };

/** The left and right halves of `bounds`, with `SPLIT_GAP` between them. */
export function splitBounds(bounds: Rectangle): [Rectangle, Rectangle] {
  const leftWidth = Math.max(0, Math.floor((bounds.width - SPLIT_GAP) / 2));
  const rightX = bounds.x + leftWidth + SPLIT_GAP;
  return [
    { ...bounds, width: leftWidth },
    {
      ...bounds,
      x: rightX,
      width: Math.max(0, bounds.x + bounds.width - rightX),
    },
  ];
}
