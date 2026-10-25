import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Positions a panel inside the page area directly below the address field,
 * left-aligned with it. Overlays live in the page area because that is
 * where the shell can draw while the page steps aside.
 */
export function AnchoredPanel({
  width,
  children,
  label,
  anchor = 'address',
}: {
  /** `null` matches the address field's width. */
  width: number | null;
  children: ReactNode;
  label: string;
  /** Under the address field, or at the page area's leading edge. */
  anchor?: 'address' | 'start';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, width: width ?? 480 });

  useLayoutEffect(() => {
    const measure = () => {
      if (anchor === 'start') {
        setPosition({ left: 8, width: width ?? 360 });
        return;
      }
      const field = document.getElementById('address-field');
      const container = ref.current?.offsetParent;
      if (!field || !(container instanceof HTMLElement)) return;
      const fieldRect = field.getBoundingClientRect();
      const frame = container.getBoundingClientRect();
      setPosition({
        left: Math.max(8, fieldRect.left - frame.left),
        width: width ?? fieldRect.width,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [width, anchor]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="overlay-in absolute top-1.5 flex max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-[10px] bg-elevated shadow-[0_0_0_0.5px_var(--hairline),0_12px_36px_rgb(0_0_0/0.2)]"
      style={{ left: position.left, width: position.width }}
    >
      {children}
    </div>
  );
}
