import { useRef, useState, type CSSProperties } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  harmonies,
  hexToPoint,
  hslToHex,
  normalizeHue,
  offsetToPoint,
  parseHex,
  pointToHex,
  pointToOffset,
  SPREAD,
  spreadBetween,
  type WheelPoint,
  WHEEL_LIGHTNESS,
  WHEEL_SATURATION,
} from '../lib/color-wheel';

const HANDLE = 22;
const HARMONY = 14;
/** The wheel's colours at mid lightness; a CSS shade darkens and lightens. */
const HUES = {
  '--wheel-hues': Array.from({ length: 13 }, (_, i) =>
    hslToHex(
      i * 30,
      WHEEL_SATURATION,
      (WHEEL_LIGHTNESS.centre + WHEEL_LIGHTNESS.rim) / 2,
    ),
  ).join(', '),
} as CSSProperties;
/** How far a press on a matching colour moves before it counts as a drag. */
const DRAG_SLOP = 3;

function placed(point: WheelPoint, size: number, diameter: number) {
  const { x, y } = pointToOffset(point, size);
  return {
    left: size / 2 + x - diameter / 2,
    top: size / 2 + y - diameter / 2,
    width: diameter,
    height: diameter,
  } satisfies CSSProperties;
}

/**
 * An Arc-style accent wheel: drag the large dot for a colour, and up to two
 * smaller dots show colours that go with it. Pressing one uses it; dragging
 * one widens or narrows the spread.
 */
export function AccentWheel({
  value,
  onChange,
  size = 176,
}: {
  /** A `#rrggbb` colour. */
  value: string;
  onChange(hex: string): void;
  size?: number;
}) {
  // The wheel keeps its own point so dragging never drifts through hex
  // rounding; it re-reads `value` only when it changes from outside.
  const [point, setPoint] = useState(() => hexToPoint(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setPoint(hexToPoint(value));
  }
  const [count, setCount] = useState(2);
  const [spread, setSpread] = useState<number>(SPREAD.initial);
  const [draft, setDraft] = useState<string | null>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const choose = (next: WheelPoint, hex = pointToHex(next)) => {
    setPoint(next);
    setSynced(hex);
    if (hex !== value) onChange(hex);
  };
  const pointAt = (event: React.PointerEvent) => {
    const box = wheel.current!.getBoundingClientRect();
    return offsetToPoint(
      event.clientX - box.left - size / 2,
      event.clientY - box.top - size / 2,
      size,
    );
  };

  // A typed or preset colour keeps its own saturation until it's dragged.
  const hex = value;
  const matches = harmonies(point, count, spread);

  return (
    <div className="flex flex-col items-center gap-2 rounded-content bg-field p-3">
      <div
        ref={wheel}
        style={{ width: size, height: size }}
        className="relative shrink-0 touch-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
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
        <div
          aria-hidden
          style={HUES}
          className="accent-wheel-dots absolute inset-0"
        />
        {matches.map((match, index) => (
          <HarmonyDot
            key={index}
            point={match}
            size={size}
            onUse={() => choose(match)}
            onDrag={(event) =>
              setSpread(spreadBetween(point.hue, pointAt(event).hue))
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
          aria-valuetext={`${hex}, hue ${Math.round(point.hue)}°, ${Math.round(point.radius * 100)}% lighter`}
          style={{ ...placed(point, size, HANDLE), background: hex }}
          className="accent-wheel-handle absolute rounded-full outline-none"
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
                radius: Math.min(1, point.radius + 0.04 * step),
              };
            if (event.key === 'ArrowDown')
              next = {
                ...point,
                radius: Math.max(0, point.radius - 0.04 * step),
              };
            if (!next) return;
            event.preventDefault();
            choose(next);
          }}
        />
      </div>

      <div className="flex w-full items-center gap-2">
        <input
          aria-label="Accent hex colour"
          value={draft ?? value}
          onChange={(event) => {
            setDraft(event.target.value);
            const typed = parseHex(event.target.value);
            if (typed) choose(hexToPoint(typed), typed);
          }}
          onBlur={() => setDraft(null)}
          maxLength={7}
          spellCheck={false}
          className="h-7 w-22 rounded-control bg-elevated px-2 font-mono text-small text-fg uppercase shadow-outline outline-none focus:shadow-focus select-text"
        />
        <span className="min-w-0 flex-1 truncate text-caption text-fg-subtle">
          {count ? 'Press a small dot to use it' : 'Drag to pick a colour'}
        </span>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Show fewer matching colours"
            title="Fewer matching colours"
            disabled={count === 0}
            onClick={() => setCount((n) => n - 1)}
            className="icon-button disabled:opacity-40"
          >
            <Minus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Show more matching colours"
            title="More matching colours"
            disabled={count === 2}
            onClick={() => setCount((n) => n + 1)}
            className="icon-button disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HarmonyDot({
  point,
  size,
  onUse,
  onDrag,
}: {
  point: WheelPoint;
  size: number;
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
      style={{ ...placed(point, size, HARMONY), background: hex }}
      className="accent-wheel-handle absolute rounded-full outline-none"
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
