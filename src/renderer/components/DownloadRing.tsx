/** A small progress ring; indeterminate when the size is unknown. */
export function DownloadRing({
  received,
  total,
  size = 14,
}: {
  received: number;
  total: number;
  size?: number;
}) {
  const radius = size / 2 - 1.5;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, received / total) : 0.25;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={total > 0 ? undefined : 'animate-spin'}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--hairline)"
        strokeWidth={1.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 200ms var(--ease-out)' }}
      />
    </svg>
  );
}
