import { useEffect, useRef, useState, type ReactNode } from 'react';
import { durationMs } from '../lib/motion';

/**
 * Opens and closes a bar's space smoothly, so the page below slides rather
 * than jumps. While closing it keeps showing what it last showed.
 */
export function Reveal({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  const last = useRef<ReactNode>(null);
  if (show) last.current = children;
  const [present, setPresent] = useState(show);

  useEffect(() => {
    if (show) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(
      () => setPresent(false),
      durationMs('--duration-exit'),
    );
    return () => clearTimeout(timer);
  }, [show]);

  if (!show && !present) return null;
  return (
    <div className="reveal" data-state={show ? 'open' : 'closed'} inert={!show}>
      <div>{show ? children : last.current}</div>
    </div>
  );
}
