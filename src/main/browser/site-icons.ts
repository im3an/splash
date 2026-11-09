/** Larger than any real site icon; anything bigger isn't one. */
const MAX_ICON_BYTES = 512 * 1024;

export type IconFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * Each site's icon as an inline image, fetched once and remembered until
 * Splash quits. Only asked for when a person enters that site's search, and
 * a failure gives nothing, which leaves the workspace's own accent in place.
 */
export class SiteIcons {
  private readonly known = new Map<string, Promise<string | null>>();

  constructor(
    private readonly fetch: IconFetch,
    private readonly timeoutMs = 2000,
  ) {}

  get(origin: string): Promise<string | null> {
    const known = this.known.get(origin);
    if (known) return known;
    const found = this.load(origin);
    this.known.set(origin, found);
    return found;
  }

  private async load(origin: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${origin}/favicon.ico`, {
        signal: controller.signal,
      });
      const type = response.headers.get('content-type')?.split(';')[0]?.trim();
      if (!response.ok || !type?.startsWith('image/')) return null;
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0 || data.length > MAX_ICON_BYTES) return null;
      return `data:${type};base64,${data.toString('base64')}`;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
