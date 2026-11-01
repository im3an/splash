/** Keep shell menus inside both their surface and the visible window. */
export function menuPosition({
  x,
  y,
  width,
  height,
  left,
  right,
  viewportHeight,
  align = 'start',
  anchorTop,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  viewportHeight: number;
  align?: 'start' | 'end';
  anchorTop?: number;
}) {
  const margin = 6;
  const availableWidth = Math.max(0, right - left - margin * 2);
  const availableHeight = Math.max(0, viewportHeight - margin * 2);
  const actualWidth = Math.min(width, availableWidth);
  const actualHeight = Math.min(height, availableHeight);
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));
  const preferredX = align === 'end' ? x - actualWidth : x;
  const flipX =
    align === 'start' &&
    preferredX + actualWidth > right - margin &&
    x - actualWidth >= left + margin;
  const flipY = y + actualHeight > viewportHeight - margin;
  return {
    left: clamp(
      flipX ? x - actualWidth : preferredX,
      left + margin,
      right - margin - actualWidth,
    ),
    top: clamp(
      flipY ? (anchorTop ?? y) - actualHeight : y,
      margin,
      viewportHeight - margin - actualHeight,
    ),
    origin: `${flipY ? 'bottom' : 'top'} ${flipX || align === 'end' ? 'right' : 'left'}`,
  };
}
