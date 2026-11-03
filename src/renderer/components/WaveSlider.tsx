/** Waves across the whole track; the drawn part ends at the thumb. */
const CYCLES = 6;
const HEIGHT = 40;
const THUMB = 24;

function wave(until: number, amplitude: number): string {
  const points: string[] = [];
  for (let x = 0; x <= until; x += 0.5) {
    const y =
      HEIGHT / 2 - Math.sin((x / 100) * CYCLES * 2 * Math.PI) * amplitude;
    points.push(`${x.toFixed(1)},${y.toFixed(2)}`);
  }
  return `M${points.join('L')}`;
}

/**
 * Arc's intensity slider: a wave runs up to the thumb and grows taller as
 * the value rises, over a soft track. A native range input lies over it,
 * so keyboard, pointer and screen readers work as usual.
 */
export function WaveSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  /** 0–1. */
  value: number;
  onChange(value: number): void;
}) {
  const at = value * 100;
  return (
    <div className="relative h-14 w-full">
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-(--divider)"
      />
      <svg
        aria-hidden
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute top-1/2 left-2 h-10 w-[calc(100%-16px)] -translate-y-1/2 overflow-visible"
      >
        <path
          d={wave(at, 3 + value * 13)}
          vectorEffect="non-scaling-stroke"
          fill="none"
          className="stroke-(--fg-subtle)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        style={{ left: `calc(${value} * (100% - ${THUMB}px))`, width: THUMB }}
        className="pointer-events-none absolute inset-y-0 rounded-full bg-(--wheel-handle-ring) shadow-(--shadow-wheel-handle) transition-shadow duration-fast peer-focus-visible:shadow-focus"
      />
    </div>
  );
}
