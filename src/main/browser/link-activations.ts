/** How long after a click its navigation may still start. */
const WINDOW_MS = 2000;

function normalize(url: string): string | null {
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

/** Two URLs that only differ in their fragment address the same document. */
export function isSameDocumentUrl(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left === null || right === null) return false;
  return left.split('#')[0] === right.split('#')[0];
}

/**
 * Remembers link clicks reported by a page so the navigation they start can
 * be recognised. Each click is consumed by at most one navigation.
 */
export class LinkActivations {
  private pending: { url: string; at: number } | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  record(url: string): void {
    const normalized = normalize(url);
    this.pending = normalized ? { url: normalized, at: this.now() } : null;
  }

  /** Whether a navigation to `url` was started by the last recorded click. */
  take(url: string): boolean {
    const pending = this.pending;
    if (!pending) return false;
    const fresh = this.now() - pending.at <= WINDOW_MS;
    const matches = normalize(url) === pending.url;
    if (matches || !fresh) this.pending = null;
    return fresh && matches;
  }
}
