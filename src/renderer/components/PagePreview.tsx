import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** A delayed, bounded preview: never a native tooltip spilling over the page. */
export function usePagePreview(
  anchor: RefObject<HTMLDivElement | null>,
  title: string,
  url: string | null,
) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPosition(null);
  }
  function show() {
    hide();
    timer.current = setTimeout(() => {
      const row = anchor.current;
      const sidebar = row?.closest('aside');
      if (!row || !sidebar) return;
      const bounds = sidebar.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      const width = Math.min(300, bounds.width - 16);
      if (width < 100) return;
      setPosition({
        left: bounds.left + 8,
        width,
        top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 116)),
      });
    }, 650);
  }
  useEffect(() => {
    const dismiss = () => hide();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', dismiss);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, []);
  let address = url ?? '';
  try {
    address = new URL(address).host;
  } catch {
    /* A blank page has no address. */
  }
  return {
    show,
    hide,
    describedBy: position ? id : undefined,
    preview:
      position &&
      createPortal(
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-[var(--radius-control)] border border-hairline bg-elevated p-3 text-fg shadow-[var(--shadow-panel)]"
          style={position}
        >
          <div className="line-clamp-2 text-small font-medium break-words">
            {title}
          </div>
          {address && (
            <div className="mt-1 truncate text-caption text-fg-muted">
              {address}
            </div>
          )}
        </div>,
        document.body,
      ),
  };
}
