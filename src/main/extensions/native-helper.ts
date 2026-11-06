/**
 * Writing to a native helper that has already ended. The extensions library
 * writes to the helper's stdin with no error listener, so this reaches the
 * process's last-resort handler rather than anything that could catch it.
 */
export function isHelperGone(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code, syscall } = error as NodeJS.ErrnoException;
  return code === 'EPIPE' && syscall === 'write';
}
