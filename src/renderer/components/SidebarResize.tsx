import { useRef, useState } from 'react';
import { api } from '../splash-api';
import { collectionNotice } from '../lib/collections';
import { useShell } from '../stores/shell-store';

const MIN = 220;
const MAX = 420;
/** A native-style divider; the live page follows through the existing inset observer. */
export function SidebarResize() {
  const saved = useShell((state) => state.preferences?.sidebarWidth ?? 260);
  const [draft, setDraft] = useState<number | null>(null);
  const start = useRef<{ x: number; width: number } | null>(null);
  const current = useRef(saved);
  const apply = (width: number) => {
    current.current = Math.round(Math.min(MAX, Math.max(MIN, width)));
    setDraft(current.current);
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${current.current}px`,
    );
  };
  const save = (width: number) => {
    void api()
      .updatePreferences({ sidebarWidth: width })
      .then(() => setDraft(null))
      .catch(() => {
        document.documentElement.style.setProperty(
          '--sidebar-width',
          `${saved}px`,
        );
        setDraft(null);
        collectionNotice('Could not save sidebar width. Try again.');
      });
  };
  return (
    <div
      role="separator"
      aria-label="Sidebar width"
      aria-orientation="vertical"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={draft ?? saved}
      tabIndex={0}
      // No title: the page is a native view above this window, so a tooltip
      // here gets cut off at the page's edge.
      aria-description="Drag to resize. Double-click to reset. Arrow keys resize when focused."
      className="sidebar-resize trail-resize"
      data-resizing={draft !== null}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { x: event.clientX, width: saved };
        current.current = saved;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (start.current)
          apply(start.current.width + event.clientX - start.current.x);
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        save(current.current);
      }}
      onPointerCancel={() => {
        start.current = null;
        apply(saved);
        setDraft(null);
      }}
      onDoubleClick={() => {
        apply(260);
        save(260);
      }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const width =
          event.key === 'Home'
            ? MIN
            : event.key === 'End'
              ? MAX
              : (draft ?? saved) + (event.key === 'ArrowLeft' ? -10 : 10);
        apply(width);
        save(current.current);
      }}
    />
  );
}
