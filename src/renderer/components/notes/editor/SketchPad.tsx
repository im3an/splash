import type { Editor } from '@tiptap/core';
import { Eraser, Undo2 } from '../../../icons';
import { useEffect, useRef, useState } from 'react';
import {
  parseSketch,
  SKETCH_INKS,
  SKETCH_WIDTHS,
  strokePath,
  type Sketch,
} from './draw';
import { useNoteUi } from './ui-store';

const WIDTH = 720;
const HEIGHT = 360;

interface Stroke {
  points: number[];
  ink: number;
  width: number;
}

/** The sketch pad, for a new sketch or the one in a sketch block. */
export function SketchEditor({ editor }: { editor: Editor }) {
  const sketch = useNoteUi((state) => state.sketch);
  if (!sketch) return null;
  const close = () => {
    useNoteUi.getState().set({ sketch: null });
    editor.commands.focus();
  };
  return (
    <SketchPad
      initial={sketch.source}
      onCancel={close}
      onSave={(json) => {
        const { pos } = sketch;
        const node = pos !== null ? editor.state.doc.nodeAt(pos) : null;
        if (pos !== null && node?.type.name === 'codeBlock') {
          const tr = editor.state.tr.replaceWith(
            pos + 1,
            pos + node.nodeSize - 1,
            editor.schema.text(json),
          );
          editor.view.dispatch(tr);
        } else {
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'codeBlock',
              attrs: { language: 'sketch' },
              content: [{ type: 'text', text: json }],
            })
            .run();
        }
        close();
      }}
    />
  );
}

/** Opens a sketch at the pad's scale, so redrawing doesn't move it. */
function toStrokes(source: string): { strokes: Stroke[]; scale: number } {
  const sketch = parseSketch(source);
  if (!sketch) return { strokes: [], scale: 1 };
  const scale = Math.min(1, WIDTH / sketch.w, HEIGHT / sketch.h);
  const left = (WIDTH - sketch.w * scale) / 2;
  const top = (HEIGHT - sketch.h * scale) / 2;
  return {
    scale,
    strokes: sketch.s.map((points, index) => ({
      points: points.map((n, i) =>
        i % 2 ? top + n * scale : left + n * scale,
      ),
      ink: sketch.k?.[index] ?? 0,
      width: sketch.t?.[index] ?? 2.5,
    })),
  };
}

function SketchPad({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (json: string) => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(
    () => toStrokes(initial).strokes,
  );
  const [ink, setInk] = useState(0);
  const [width, setWidth] = useState<number>(SKETCH_WIDTHS[1]);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef<Stroke | null>(null);
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
        event.stopPropagation();
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
    ] as const;
  };

  /** The eraser takes whole strokes that pass near the pointer. */
  const erase = (x: number, y: number) =>
    setStrokes((list) =>
      list.filter(
        (stroke) =>
          !stroke.points.some(
            (n, i) =>
              i % 2 === 0 &&
              Math.hypot(n - x, (stroke.points[i + 1] ?? 0) - y) < 10,
          ),
      ),
    );

  const save = () => {
    if (!strokes.length) return onCancel();
    const xs = strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 0));
    const ys = strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 1));
    const pad = 12;
    const left = Math.max(0, Math.min(...xs) - pad);
    const top = Math.max(0, Math.min(...ys) - pad);
    const w = Math.min(WIDTH, Math.max(...xs) + pad) - left;
    const h = Math.min(HEIGHT, Math.max(...ys) + pad) - top;
    const sketch: Sketch = {
      w: Math.round(w),
      h: Math.round(h),
      s: strokes.map((stroke) =>
        stroke.points.map(
          (n, i) => Math.round((n - (i % 2 ? top : left)) * 10) / 10,
        ),
      ),
    };
    if (strokes.some((stroke) => stroke.ink))
      sketch.k = strokes.map((s) => s.ink);
    if (strokes.some((stroke) => stroke.width !== 2.5))
      sketch.t = strokes.map((s) => s.width);
    onSave(JSON.stringify(sketch));
  };

  return (
    <div className="note-scrim" onPointerDown={onCancel}>
      <div
        role="dialog"
        aria-label="Sketch"
        className="note-pop note-sheet note-sketch-sheet"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="note-sketch-tools" role="toolbar" aria-label="Pen">
          {SKETCH_INKS.map((colour, index) => (
            <button
              key={colour}
              type="button"
              className="note-ink"
              aria-label={['Ink', 'Accent', 'Red', 'Blue', 'Green'][index]}
              aria-pressed={!erasing && ink === index}
              style={{ color: colour }}
              onClick={() => {
                setInk(index);
                setErasing(false);
              }}
            />
          ))}
          <span className="note-toolbar-sep" />
          {SKETCH_WIDTHS.map((size) => (
            <button
              key={size}
              type="button"
              className="note-pen"
              aria-label={`Pen ${size}`}
              aria-pressed={!erasing && width === size}
              onClick={() => {
                setWidth(size);
                setErasing(false);
              }}
            >
              <span style={{ height: size + 1 }} />
            </button>
          ))}
          <span className="note-toolbar-sep" />
          <button
            type="button"
            className="note-toolbar-button"
            aria-label="Eraser"
            title="Eraser"
            aria-pressed={erasing}
            onClick={() => setErasing((on) => !on)}
          >
            <Eraser size={15} />
          </button>
          <button
            type="button"
            className="note-toolbar-button"
            aria-label="Undo stroke (⌘Z)"
            title="Undo stroke (⌘Z)"
            disabled={!strokes.length}
            onClick={() => setStrokes((list) => list.slice(0, -1))}
          >
            <Undo2 size={15} />
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="note-sketch-canvas"
          data-erasing={erasing}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const [x, y] = point(event);
            if (erasing) return erase(x, y);
            drawing.current = { points: [x, y], ink, width };
            redraw((n) => n + 1);
          }}
          onPointerMove={(event) => {
            if (erasing && event.buttons) {
              const [x, y] = point(event);
              return erase(x, y);
            }
            if (!drawing.current) return;
            drawing.current.points.push(...point(event));
            redraw((n) => n + 1);
          }}
          onPointerUp={() => {
            const stroke = drawing.current;
            drawing.current = null;
            if (stroke && stroke.points.length >= 2)
              setStrokes((list) => [...list, stroke]);
          }}
        >
          {[...strokes, ...(drawing.current ? [drawing.current] : [])].map(
            (stroke, index) => (
              <path
                key={index}
                d={strokePath(stroke.points)}
                stroke={SKETCH_INKS[stroke.ink]}
                strokeWidth={stroke.width}
              />
            ),
          )}
        </svg>
        <div className="note-sheet-actions">
          <span className="note-sheet-hint">
            Draw with a trackpad, mouse or pen
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
          <button type="button" className="button button-raised" onClick={save}>
            {initial ? 'Save sketch' : 'Insert sketch'}
          </button>
        </div>
      </div>
    </div>
  );
}
