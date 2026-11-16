import { useRef, useState, type CSSProperties } from 'react';
import { Minus, Plus } from '../icons';
import {
  harmonies,
  hexToPoint,
  normalizeHue,
  offsetToPoint,
  pointToHex,
  pointToOffset,
  SPREAD,
  spreadBetween,
  type WheelPoint,
} from '../lib/color-wheel';

/**
 * The canvas's height; colours lie within `RADIUS` of `CENTER`, which sits a
 * little high to leave room for the buttons along the bottom.
 */
const HEIGHT = 248;
const CENTER = 112;
const RADIUS = 92;
const HANDLE = 32;
const HARMONY = 20;
/** How far a press on a matching colour moves before it counts as a drag. */
const DRAG_SLOP = 3;

function placed(point: WheelPoint, diameter: number) {
  const { x, y } = pointToOffset(point, RADIUS * 2);
  return {
    left: `calc(50% + ${x - diameter / 2}px)`,
    top: CENTER + y - diameter / 2,
    width: diameter,
    height: diameter,
  } satisfies CSSProperties;
}

/** The colours a canvas shows: its main point and the matching ones. */
function wheelColors(
  point: WheelPoint,
  count: number,
  spread: number,
): string[] {
  return [point, ...harmonies(point, count, spread)].map(pointToHex);
}

/** The spread a canvas's colours were picked at, read back from them. */
function spreadOf(colors: readonly string[]): number {
  const [main, other] = colors;
  if (!main || !other) return SPREAD.initial;
  return spreadBetween(hexToPoint(main).hue, hexToPoint(other).hue);
}

/**
 * A field of dots, after Arc's, where the angle from the centre is the hue
 * and the distance how vivid it is. Drag the large dot for the main colour
 * (the accent); up to two smaller ones add colours that go with it. Pressing
 * one makes it the main colour; dragging one spreads them apart.
 */
export function AccentWheel({
  colors,
  onChange,
}: {
  /** One to three `#rrggbb` colours, the main one first. */
  colors: readonly string[];
  onChange(colors: string[]): void;
}) {
  const key = colors.join(' ');
  const count = Math.max(0, Math.min(2, colors.length - 1));
  // The canvas keeps its own point and spread so dragging never drifts
  // through hex rounding; it re-reads `colors` only when they change from
  // outside.
  const [point, setPoint] = useState(() =>
    colors[0] ? hexToPoint(colors[0]) : { hue: 0, radius: 0.5 },
  );
  const [spread, setSpread] = useState(() => spreadOf(colors));
  const [synced, setSynced] = useState(key);
  if (key !== synced) {
    setSynced(key);
    if (colors[0]) setPoint(hexToPoint(colors[0]));
    if (colors.length > 1) setSpread(spreadOf(colors));
  }
  const canvas = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const emit = (next: WheelPoint, nextCount: number, nextSpread: number) => {
    const picked = wheelColors(next, nextCount, nextSpread);
    setSynced(picked.join(' '));
    if (picked.join(' ') !== key) onChange(picked);
  };
  const choose = (next: WheelPoint) => {
    setPoint(next);
    emit(next, count, spread);
  };
  const widen = (next: number) => {
    setSpread(next);
    emit(point, count, next);
  };
  const pointAt = (event: React.PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect();
    return offsetToPoint(
      event.clientX - box.left - box.width / 2,
      event.clientY - box.top - CENTER,
      RADIUS * 2,
    );
  };

  const hex = pointToHex(point);
  const matches = harmonies(point, count, spread);

  return (
    <div
      ref={canvas}
      style={{ height: HEIGHT }}
      className="color-canvas relative w-full shrink-0 touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        handle.current?.focus({ preventScroll: true });
        choose(pointAt(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) choose(pointAt(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {matches.map((match, index) => (
        <HarmonyDot
          key={index}
          point={match}
          onUse={() => choose(match)}
          onDrag={(event) =>
            widen(spreadBetween(point.hue, pointAt(event).hue))
          }
        />
      ))}
      <div
        ref={handle}
        role="slider"
        tabIndex={0}
        aria-label="Accent colour"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(point.hue)}
        aria-valuetext={`hue ${Math.round(point.hue)}°, ${Math.round(point.radius * 100)}% vivid`}
        style={{ ...placed(point, HANDLE), background: hex }}
        className="color-canvas-dot absolute rounded-full outline-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          canvas.current!.setPointerCapture(event.pointerId);
          dragging.current = true;
          event.currentTarget.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 3 : 1;
          let next: WheelPoint | null = null;
          if (event.key === 'ArrowLeft')
            next = { ...point, hue: normalizeHue(point.hue - 5 * step) };
          if (event.key === 'ArrowRight')
            next = { ...point, hue: normalizeHue(point.hue + 5 * step) };
          if (event.key === 'ArrowUp')
            next = {
              ...point,
              radius: Math.min(1, point.radius + 0.05 * step),
            };
          if (event.key === 'ArrowDown')
            next = {
              ...point,
              radius: Math.max(0, point.radius - 0.05 * step),
            };
          if (!next) return;
          event.preventDefault();
          choose(next);
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1 *:pointer-events-auto">
        <button
          type="button"
          aria-label="Remove a colour"
          title="Remove a colour"
          disabled={count === 0}
          onClick={() => emit(point, count - 1, spread)}
          className="icon-button"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="Add a colour"
          title="Add a colour"
          disabled={count === 2}
          onClick={() => emit(point, count + 1, spread)}
          className="icon-button"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function HarmonyDot({
  point,
  onUse,
  onDrag,
}: {
  point: WheelPoint;
  onUse(): void;
  onDrag(event: React.PointerEvent): void;
}) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hex = pointToHex(point);
  return (
    <button
      type="button"
      aria-label={`Use ${hex}`}
      title={hex}
      style={{ ...placed(point, HARMONY), background: hex }}
      className="color-canvas-dot absolute rounded-full outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const pressed = start.current;
        if (!pressed) return;
        if (
          !pressed.moved &&
          Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <
            DRAG_SLOP
        )
          return;
        pressed.moved = true;
        onDrag(event);
      }}
      onPointerUp={() => {
        const pressed = start.current;
        start.current = null;
        if (pressed && !pressed.moved) onUse();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onUse();
        }
      }}
    />
  );
}
