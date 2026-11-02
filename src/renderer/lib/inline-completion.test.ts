import { describe, expect, it } from 'vitest';
import type { PaletteItem } from '../../shared/types';
import {
  completionFor,
  fits,
  withSearchSuggestions,
} from './inline-completion';

const lead: PaletteItem = {
  kind: 'navigate',
  section: 'go',
  id: 'complete',
  input: 'https://github.com/',
  completion: 'github.com',
  title: 'GitHub',
  subtitle: 'github.com',
};
const searchFor: PaletteItem = {
  kind: 'navigate',
  section: 'go',
  id: 'navigate',
  input: 'gi',
  title: 'Search for “gi”',
  subtitle: 'DuckDuckGo',
};
const history = (n: number): PaletteItem => ({
  kind: 'history',
  section: 'history',
  id: `history:${n}`,
  url: `https://h${n}.example/`,
  faviconUrl: null,
  title: `H${n}`,
  subtitle: '',
});
const search = (text: string): PaletteItem => ({
  kind: 'search',
  section: 'search',
  id: `search:${text}`,
  url: `https://duckduckgo.com/?q=${text}`,
  title: text,
  subtitle: '',
});

describe('fits', () => {
  it('needs the completion to extend the typed text', () => {
    expect(fits('github.com', 'gi')).toBe(true);
    expect(fits('github.com', 'GIT')).toBe(true);
    expect(fits('github.com', 'github.com')).toBe(false);
    expect(fits('github.com', 'gu')).toBe(false);
    expect(fits(null, 'gi')).toBe(false);
  });
});

describe('completionFor', () => {
  it('reads the completion off the leading row', () => {
    expect(completionFor([lead, searchFor], 'gi')).toBe('github.com');
    expect(completionFor([lead], 'gx')).toBeNull();
    expect(completionFor([searchFor, lead], 'gi')).toBeNull();
    expect(completionFor([], 'gi')).toBeNull();
  });
});

describe('withSearchSuggestions', () => {
  it('places suggestions after the leading rows and a few results', () => {
    const items = [lead, searchFor, history(1), history(2), history(3)];
    expect(
      withSearchSuggestions(items, [search('a')], 2).map((item) => item.id),
    ).toEqual([
      'complete',
      'navigate',
      'history:1',
      'history:2',
      'search:a',
      'history:3',
    ]);
  });

  it('replaces earlier suggestions and copes with short lists', () => {
    const first = withSearchSuggestions([searchFor], [search('a')], 3);
    expect(
      withSearchSuggestions(first, [search('b')], 3).map((item) => item.id),
    ).toEqual(['navigate', 'search:b']);
  });
});
