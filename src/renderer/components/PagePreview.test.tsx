// @vitest-environment jsdom
import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { usePagePreview } from './PagePreview';
function Example() {
  const ref = useRef<HTMLDivElement>(null);
  const preview = usePagePreview(
    ref,
    'A long page title',
    'https://example.com/path',
  );
  return (
    <aside>
      <div
        ref={ref}
        onMouseEnter={preview.show}
        onMouseLeave={preview.hide}
        onPointerDown={preview.hide}
      >
        Page
      </div>
      {preview.preview}
    </aside>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 260,
    top: 80,
    bottom: 110,
    width: 260,
    height: 30,
    x: 0,
    y: 80,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('delays the preview and keeps it inside the sidebar', () => {
  render(<Example />);
  fireEvent.mouseEnter(screen.getByText('Page'));
  expect(screen.queryByRole('tooltip')).toBeNull();
  act(() => vi.advanceTimersByTime(650));
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.style.width).toBe('244px');
  expect(tooltip.style.left).toBe('8px');
  expect(screen.getByText('example.com')).toBeTruthy();
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
it('cancels a pending preview when the user activates the row', () => {
  render(<Example />);
  fireEvent.mouseEnter(screen.getByText('Page'));
  fireEvent.pointerDown(screen.getByText('Page'));
  act(() => vi.advanceTimersByTime(650));
  expect(screen.queryByRole('tooltip')).toBeNull();
});
