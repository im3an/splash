/** A motion token in milliseconds; 0 when the user asks for reduced motion. */
export function durationMs(
  token: '--duration-exit' | '--duration-slow',
): number {
  if (typeof document === 'undefined') return 0;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const ms = Number.parseFloat(value);
  if (!Number.isFinite(ms)) return 0;
  return value.endsWith('ms') ? ms : ms * 1000;
}
