import { describe, expect, it, vi } from 'vitest';
import {
  SearchSuggestions,
  parseSuggestions,
  shouldAskEngine,
  suggestUrl,
  type SuggestionFetch,
} from './search-suggestions';

function answering(body: unknown, ok = true) {
  return vi.fn<SuggestionFetch>(async () => ({ ok, json: async () => body }));
}

describe('parseSuggestions', () => {
  it('reads the OpenSearch list, without blanks or repeats', () => {
    expect(
      parseSuggestions(['git', ['github', ' GitHub ', '', 4, 'git log']]),
    ).toEqual(['github', 'git log']);
  });

  it('gives nothing for other shapes', () => {
    expect(parseSuggestions({ results: [] })).toEqual([]);
    expect(parseSuggestions(['git'])).toEqual([]);
    expect(parseSuggestions(null)).toEqual([]);
  });
});

describe('shouldAskEngine', () => {
  it('keeps full addresses and local hosts private', () => {
    expect(shouldAskEngine('weather berlin')).toBe(true);
    expect(shouldAskEngine('github.com')).toBe(true);
    expect(shouldAskEngine('https://intranet/secret')).toBe(false);
    expect(shouldAskEngine('localhost:3000')).toBe(false);
    expect(shouldAskEngine('192.168.1.1')).toBe(false);
    expect(shouldAskEngine('   ')).toBe(false);
    expect(shouldAskEngine('x'.repeat(101))).toBe(false);
  });
});

describe('suggestUrl', () => {
  it('encodes the query for the chosen engine', () => {
    expect(suggestUrl('a&b c', 'duckduckgo')).toBe(
      'https://duckduckgo.com/ac/?type=list&q=a%26b%20c',
    );
  });
});

describe('SearchSuggestions', () => {
  it('asks the engine once per query and remembers the answer', async () => {
    const fetch = answering(['git', ['github', 'git log']]);
    const suggestions = new SearchSuggestions(fetch);
    expect(await suggestions.get('git', 'google')).toEqual([
      'github',
      'git log',
    ]);
    expect(await suggestions.get('GIT ', 'google')).toEqual([
      'github',
      'git log',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toContain('suggestqueries.google.com');
  });

  it('gives nothing when the engine fails or is skipped', async () => {
    expect(
      await new SearchSuggestions(answering([], false)).get('a', 'bing'),
    ).toEqual([]);
    const throwing = vi.fn<SuggestionFetch>(async () => {
      throw new Error('offline');
    });
    expect(await new SearchSuggestions(throwing).get('a', 'bing')).toEqual([]);
    const fetch = answering(['x', ['y']]);
    expect(await new SearchSuggestions(fetch).get('http://x', 'bing')).toEqual(
      [],
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gives up on a slow engine', async () => {
    vi.useFakeTimers();
    const slow = vi.fn<SuggestionFetch>(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const pending = new SearchSuggestions(slow, 500).get('slow', 'duckduckgo');
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual([]);
    vi.useRealTimers();
  });
});

it('does not repopulate a cleared cache from an outstanding request', async () => {
  let resolve!: (value: unknown) => void;
  const body = new Promise((done) => {
    resolve = done;
  });
  const fetch = vi.fn<SuggestionFetch>(async () => ({
    ok: true,
    json: () => body,
  }));
  const suggestions = new SearchSuggestions(fetch);
  const pending = suggestions.get('private query', 'google');
  suggestions.clear();
  resolve(['private query', ['answer']]);
  expect(await pending).toEqual([]);
  await suggestions.get('private query', 'google');
  expect(fetch).toHaveBeenCalledTimes(2);
});
