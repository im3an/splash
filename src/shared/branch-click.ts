/** Eligible ordinary links branch without unloading their source document. */
export function canBranchLink(
  current: string,
  href: string,
  target: string,
  prevented: boolean,
): boolean {
  if (prevented || (target !== '' && target.toLowerCase() !== '_self'))
    return false;
  try {
    const from = new URL(current);
    const to = new URL(href);
    if (!['http:', 'https:'].includes(to.protocol)) return false;
    from.hash = '';
    to.hash = '';
    return from.href !== to.href;
  } catch {
    return false;
  }
}
