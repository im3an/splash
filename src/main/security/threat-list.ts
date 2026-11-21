import type { ThreatListStatus } from '../../shared/types';

/** Lists a day older than this are looked at again. */
export const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
/** How often to check, so a failed download is retried before long. */
export const CHECK_EVERY_MS = 60 * 60 * 1000;
/** A list this small is an error page or a broken mirror, not the list. */
const MIN_ENTRIES = 100;

const HOST = /^[a-z\d]([a-z\d-]*[a-z\d])?(\.[a-z\d]([a-z\d-]*[a-z\d])?)+$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The hosts in a downloaded list; comments and anything else are skipped. */
export function parseThreatList(text: string): string[] {
  const hosts: string[] = [];
  for (const line of text.split('\n')) {
    const host = line.trim().toLowerCase();
    if (host && !host.startsWith('#') && HOST.test(host)) hosts.push(host);
  }
  return hosts;
}

/** A listed host covers what's under it; `a.b.com` looks up to `b.com`. */
export function isHostListed(
  listed: ReadonlySet<string>,
  hostname: string,
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (listed.has(host)) return true;
  if (IPV4.test(host)) return false;
  const labels = host.split('.');
  for (let start = 1; start < labels.length - 1; start++) {
    if (listed.has(labels.slice(start).join('.'))) return true;
  }
  return false;
}

/**
 * Where a choice to visit a reported site is kept. By host alone: HTTP goes
 * to HTTPS on the way, and the choice must hold for both.
 */
export function dangerousSiteKey(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' || protocol === 'http:'
      ? `https://${hostname}`
      : null;
  } catch {
    return null;
  }
}

export interface ThreatListOptions {
  /** Each source, tried at its mirrors in order. */
  download(): Promise<string[]>;
  readCache(): Promise<{ text: string; savedAt: number } | null>;
  writeCache(text: string): Promise<void>;
  enabled(): boolean;
  now(): number;
}

/**
 * Public phishing and malware lists, kept on this Mac and checked here, so no
 * address the user visits is ever sent anywhere. What's in use stays in use
 * when a newer download fails.
 */
export class ThreatList {
  private listed: ReadonlySet<string> = new Set();
  private updatedAt: number | null = null;
  private updateFailed = false;
  private loading = false;
  private loaded = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: ThreatListOptions) {}

  isListed(hostname: string): boolean {
    return isHostListed(this.listed, hostname);
  }

  /** Every listed host, for the helper extension that stops requests. */
  hosts(): string[] {
    return [...this.listed];
  }

  /** Called whenever the hosts in use change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  getStatus(): ThreatListStatus {
    const count = this.listed.size;
    const base = { updatedAt: this.updatedAt, count };
    if (!this.options.enabled())
      return { ...base, state: 'off', updateFailed: false };
    if (this.updatedAt !== null)
      return { ...base, state: 'ready', updateFailed: this.updateFailed };
    return {
      ...base,
      state: this.updateFailed ? 'failed' : 'loading',
      updateFailed: this.updateFailed,
    };
  }

  /** Reads what's saved, then downloads newer lists if they're due. */
  async refresh(): Promise<void> {
    if (!this.options.enabled() || this.loading) return;
    this.loading = true;
    try {
      if (!this.loaded) await this.loadSaved();
      const { updatedAt } = this;
      if (
        updatedAt === null ||
        this.options.now() - updatedAt >= REFRESH_AFTER_MS
      ) {
        await this.download();
      }
    } finally {
      this.loading = false;
    }
  }

  private async loadSaved(): Promise<void> {
    this.loaded = true;
    const saved = await this.options.readCache().catch(() => null);
    if (!saved) return;
    this.listed = new Set(parseThreatList(saved.text));
    this.updatedAt = this.listed.size > 0 ? saved.savedAt : null;
    this.changed();
  }

  private async download(): Promise<void> {
    try {
      const hosts = (await this.options.download()).flatMap(parseThreatList);
      if (hosts.length < MIN_ENTRIES)
        throw new Error('The lists came back nearly empty');
      this.listed = new Set(hosts);
      this.updatedAt = this.options.now();
      this.updateFailed = false;
      this.changed();
      await this.options
        .writeCache([...this.listed].join('\n'))
        .catch((error: unknown) =>
          console.error('Could not save the threat lists', error),
        );
    } catch (error) {
      this.updateFailed = true;
      console.error('Could not download the threat lists', error);
    }
  }
}
