import { useRef } from 'react';
import { grainImage } from '../lib/grain';

const SIZE = 68;
const DOTS = 24;
/** The ring of dots sits this far in from the edge; the marker outside. */
const RING = 7;
/** The dial turns through 270°, from bottom left to bottom right. */
const SWEEP = 135;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Arc's grain dial: turn the knob, or use the arrow keys, for how much
 * noise lies over the frame. The ring lights up to the value and the
 * knob's face shows the grain itself.
 */
export function GrainDial({
  label,
  value,
  onChange,
}: {
  label: string;
  /** 0–1. */
  value: number;
  onChange(value: number): void;
}) {
  const dragging = useRef(false);
  const angle = -SWEEP + value * SWEEP * 2;

  const valueAt = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const degrees =
      (Math.atan2(
        event.clientX - box.left - box.width / 2,
        -(event.clientY - box.top - box.height / 2),
      ) *
        180) /
      Math.PI;
    // Below the dial, where it doesn't turn, stay at the nearer end.
    if (Math.abs(degrees) > SWEEP) return value < 0.5 ? 0 : 1;
    return (degrees + SWEEP) / (SWEEP * 2);
  };
  const set = (next: number) => {
    const rounded = Math.round(clamp(next) * 100) / 100;
    if (rounded !== value) onChange(rounded);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      style={{ width: SIZE, height: SIZE }}
      className="grain-dial relative shrink-0 cursor-grab touch-none rounded-full outline-none active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        dragging.current = true;
        set(valueAt(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) set(valueAt(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.2 : 0.05;
        const next = {
          ArrowUp: value + step,
          ArrowRight: value + step,
          ArrowDown: value - step,
          ArrowLeft: value - step,
          PageUp: value + 0.2,
          PageDown: value - 0.2,
          Home: 0,
          End: 1,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        set(next);
      }}
    >
      {Array.from({ length: DOTS }, (_, i) => {
        const at = i / (DOTS - 1);
        const turn = ((-SWEEP + at * SWEEP * 2) * Math.PI) / 180;
        return (
          <span
            key={i}
            aria-hidden
            data-lit={at <= value + 0.001 || undefined}
            className="grain-dial-dot"
            style={{
              left: SIZE / 2 + Math.sin(turn) * (SIZE / 2 - RING) - 2,
              top: SIZE / 2 - Math.cos(turn) * (SIZE / 2 - RING) - 2,
            }}
          />
        );
      })}
      <span
        aria-hidden
        className="grain-dial-knob"
        style={{
          // Stronger than on the frame, so it reads at this size.
          backgroundImage: grainImage(value, 0.55),
        }}
      />
      {/* Arc's marker: a white pill just outside the ring, where it points. */}
      <span
        aria-hidden
        className="grain-dial-marker"
        style={{ rotate: `${angle}deg` }}
      />
    </div>
  );
}
