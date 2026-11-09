import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useDialogFocus } from '../hooks/use-dialog-focus';

/**
 * Positions a panel inside the page area directly below the address field,
 * left-aligned with it (or at the page's leading edge when the field is in
 * the sidebar). Overlays live in the page area because that is
 * where the shell can draw while the page steps aside.
 */
export function AnchoredPanel({
  width,
  children,
  label,
  anchor = 'address',
  alignEndTo,
  modal = false,
}: {
  /** `null` matches the address field's width. */
  width: number | null;
  children: ReactNode;
  label: string;
  /** Under the address field, or at the page area's leading edge. */
  anchor?: 'address' | 'start';
  /**
   * The id of a control to line the panel's right edge up with, instead of
   * `anchor`, kept inside the page area. A control off to the left of the page
   * area, like one in the sidebar, puts the panel at the page's leading edge.
   */
  alignEndTo?: string;
  modal?: boolean;
}) {
  const ref = useDialogFocus<HTMLDivElement>(modal);
  const [position, setPosition] = useState({ left: 8, width: width ?? 480 });

  useLayoutEffect(() => {
    const measure = () => {
      if (alignEndTo) {
        const container = ref.current?.offsetParent;
        if (!(container instanceof HTMLElement)) return;
        const frame = container.getBoundingClientRect();
        const panelWidth = Math.min(
          width ?? 360,
          Math.max(0, frame.width - 16),
        );
        const control = document.getElementById(alignEndTo);
        const end = control
          ? control.getBoundingClientRect().right - frame.left
          : frame.width - 8;
        setPosition({
          left: Math.max(
            8,
            Math.min(end - panelWidth, frame.width - panelWidth - 8),
          ),
          width: panelWidth,
        });
        return;
      }
      if (anchor === 'start') {
        setPosition({ left: 8, width: width ?? 360 });
        return;
      }
      const field = document.getElementById('address-field');
      const container = ref.current?.offsetParent;
      if (!field || !(container instanceof HTMLElement)) return;
      const fieldRect = field.getBoundingClientRect();
      const frame = container.getBoundingClientRect();
      // The sidebar's address pill is beside the page area, not above it,
      // and too narrow to set the width: the panel opens at the page's edge.
      if (fieldRect.right <= frame.left) {
        setPosition({
          left: 8,
          width: width ?? Math.min(560, frame.width - 16),
        });
        return;
      }
      const panelWidth = Math.min(
        width ?? fieldRect.width,
        Math.max(0, frame.width - 16),
      );
      setPosition({
        left: Math.max(
          8,
          Math.min(fieldRect.left - frame.left, frame.width - panelWidth - 8),
        ),
        width: panelWidth,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [width, anchor, alignEndTo]);

  return (
    <div
      ref={ref}
      role="dialog"
      tabIndex={modal ? -1 : undefined}
      aria-modal={modal || undefined}
      aria-label={label}
      className="popover-in absolute top-1.5 flex max-h-[calc(100%-12px)] max-w-[calc(100%-16px)] flex-col overflow-y-auto rounded-content bg-elevated shadow-panel outline-none"
      style={{ left: position.left, width: position.width }}
    >
      {children}
    </div>
  );
}
