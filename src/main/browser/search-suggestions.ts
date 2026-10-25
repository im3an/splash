import type { SearchEngineId } from '../../shared/preferences';

/**
 * Where each engine answers "what might I be searching for?", all in the
 * OpenSearch suggestions format: `[query, [suggestion, …], …]`.
 */
const SUGGEST_URLS: Record<SearchEngineId, string> = {
  duckduckgo: 'https://duckduckgo.com/ac/?type=list&q=',
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',
  bing: 'https://api.bing.com/osjson.aspx?query=',
  brave: 'https://search.brave.com/api/suggest?q=',
  startpage: 'https://www.startpage.com/osuggestions?q=',
  ecosia: 'https://ac.ecosia.org/autocomplete?type=list&q=',
};

export function suggestUrl(query: string, engine: SearchEngineId): string {
  return SUGGEST_URLS[engine] + encodeURIComponent(query);
}

/** The suggestions in an OpenSearch answer; anything else gives none. */
export function parseSuggestions(body: unknown, limit = 8): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of body[1] as unknown[]) {
    if (typeof value !== 'string') continue;
    const text = value.trim().slice(0, 200);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * Whether typing this should be sent to the search engine at all. Full
 * addresses, local hosts and long pastes stay on this Mac.
 */
export function shouldAskEngine(query: string): boolean {
  const text = query.trim();
  if (!text || text.length > 100) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) return false;
  if (/^(localhost|127\.|10\.|192\.168\.|\[)/i.test(text)) return false;
  return true;
}

export type SuggestionFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const CACHE_SIZE = 64;

/**
 * Search suggestions from the chosen engine, with a short timeout so a slow
 * engine never holds the list up, and a small cache so going back over the
 * same letters doesn't ask again. Failures give no suggestions.
 */
export class SearchSuggestions {
  private readonly cache = new Map<string, string[]>();

  constructor(
    private readonly fetch: SuggestionFetch,
    private readonly timeoutMs = 1500,
  ) {}

  async get(query: string, engine: SearchEngineId): Promise<string[]> {
    if (!shouldAskEngine(query)) return [];
    const text = query.trim();
    const key = `${engine}\n${text.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached) {
      // Refresh its place as most recently used.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(suggestUrl(text, engine), {
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const suggestions = parseSuggestions(await response.json());
      this.cache.set(key, suggestions);
      if (this.cache.size > CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      return suggestions;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
