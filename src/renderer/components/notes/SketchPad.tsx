import { useEffect, useRef, useState } from 'react';
import { strokePath } from './render-note';

const WIDTH = 640;
const HEIGHT = 320;

/**
 * A small drawing surface. The result goes into the note as a `sketch` code
 * block of plain numbers, so it stays text and renders as a vector.
 */
export function SketchPad({
  onCancel,
  onInsert,
}: {
  onCancel: () => void;
  onInsert: (block: string) => void;
}) {
  const [strokes, setStrokes] = useState<number[][]>([]);
  const drawing = useRef<number[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
      if (event.key === 'z' && event.metaKey) {
        event.preventDefault();
        setStrokes((list) => list.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const point = (event: React.PointerEvent) => {
    const box = svgRef.current!.getBoundingClientRect();
    return [
      Math.round(((event.clientX - box.left) / box.width) * WIDTH * 10) / 10,
      Math.round(((event.clientY - box.top) / box.height) * HEIGHT * 10) / 10,
    ];
  };

  const insert = () => {
    if (!strokes.length) return onCancel();
    // Trim to what was drawn, with a margin.
    const xs = strokes.flatMap((s) => s.filter((_, i) => i % 2 === 0));
    const ys = strokes.flatMap((s) => s.filter((_, i) => i % 2 === 1));
    const left = Math.max(0, Math.min(...xs) - 12);
    const top = Math.max(0, Math.min(...ys) - 12);
    const w = Math.min(WIDTH, Math.max(...xs) + 12) - left;
    const h = Math.min(HEIGHT, Math.max(...ys) + 12) - top;
    const s = strokes.map((stroke) =>
      stroke.map((n, i) => Math.round((n - (i % 2 ? top : left)) * 10) / 10),
    );
    onInsert(
      '```sketch\n' +
        JSON.stringify({ w: Math.round(w), h: Math.round(h), s }) +
        '\n```',
    );
  };

  return (
    <div className="notes-sketch-scrim overlay-in" onPointerDown={onCancel}>
      <div
        role="dialog"
        aria-label="Sketch"
        className="notes-sketch"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="notes-sketch-canvas"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = point(event);
            redraw((n) => n + 1);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            drawing.current.push(...point(event));
            redraw((n) => n + 1);
          }}
          onPointerUp={() => {
            const stroke = drawing.current;
            drawing.current = null;
            if (stroke && stroke.length >= 2)
              setStrokes((list) => [...list, stroke]);
          }}
        >
          {strokes.map((stroke, index) => (
            <path key={index} d={strokePath(stroke)} />
          ))}
          {drawing.current && <path d={strokePath(drawing.current)} />}
        </svg>
        <div className="notes-sketch-actions">
          <span className="notes-sketch-hint">
            Draw with the pointer · ⌘Z undoes a stroke
          </span>
          <button
            type="button"
            className="button"
            disabled={!strokes.length}
            onClick={() => setStrokes([])}
          >
            Clear
          </button>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-raised"
            onClick={insert}
          >
            Insert sketch
          </button>
        </div>
      </div>
    </div>
  );
}
