import { describe, expect, it } from 'vitest';
import type { HistoryMatch } from '../storage/trail-store';
import {
  bareUrl,
  editDistance,
  frecency,
  inlineCompletion,
  rankHistory,
  suggestedHistory,
} from './history-ranking';

const NOW = 1_000 * 86_400_000;
const DAY = 86_400_000;

function visit(
  url: string,
  title = '',
  visitCount = 1,
  daysAgo = 0,
): HistoryMatch {
  return { url, title, visitCount, lastVisitedAt: NOW - daysAgo * DAY };
}

describe('frecency', () => {
  it('weighs recent and repeated visits more', () => {
    const today = frecency(visit('https://a.example/', '', 1, 0), NOW);
    const lastYear = frecency(visit('https://a.example/', '', 1, 300), NOW);
    const often = frecency(visit('https://a.example/', '', 16, 0), NOW);
    expect(today).toBeGreaterThan(lastYear);
    expect(often).toBeGreaterThan(today);
  });
});

describe('bareUrl', () => {
  it('drops the scheme, "www." and a lone slash', () => {
    expect(bareUrl('https://www.github.com/')).toBe('github.com');
    expect(bareUrl('https://www.github.com/', true)).toBe('www.github.com');
    expect(bareUrl('http://github.com/a/')).toBe('github.com/a/');
  });
});

describe('editDistance', () => {
  it('counts a swap of neighbours as one edit', () => {
    expect(editDistance('gihtub', 'github')).toBe(1);
    expect(editDistance('githb', 'githu')).toBe(1);
    expect(editDistance('same', 'same')).toBe(0);
  });
});

describe('rankHistory', () => {
  it('ranks a match in the site name above one in the title', () => {
    const ranked = rankHistory(
      'git',
      [
        visit('https://blog.example/post', 'Using git well'),
        visit('https://github.com/', 'GitHub'),
      ],
      NOW,
    );
    expect(ranked.map((r) => r.entry.url)).toEqual([
      'https://github.com/',
      'https://blog.example/post',
    ]);
  });

  it('prefers the page visited more often among equal matches', () => {
    const ranked = rankHistory(
      'docs',
      [
        visit('https://docs.a.example/', 'A docs', 1, 40),
        visit('https://docs.b.example/', 'B docs', 30, 1),
      ],
      NOW,
    );
    expect(ranked[0]?.entry.url).toBe('https://docs.b.example/');
  });

  it('finds a site through a typo, below real matches', () => {
    const ranked = rankHistory(
      'gihtub',
      [
        visit('https://github.com/', 'GitHub', 20),
        visit('https://news.example/gihtub', 'Odd page'),
      ],
      NOW,
    );
    expect(ranked.map((r) => [r.entry.url, r.fuzzy])).toEqual([
      ['https://news.example/gihtub', false],
      ['https://github.com/', true],
    ]);
  });

  it('ignores typos in short words and other first letters', () => {
    const entries = [visit('https://github.com/', 'GitHub')];
    expect(rankHistory('gih', entries, NOW)).toEqual([]);
    expect(rankHistory('fithub', entries, NOW)).toEqual([]);
  });

  it('shows the same page over http and https once', () => {
    const ranked = rankHistory(
      'example',
      [visit('http://example.org/'), visit('https://www.example.org/', '', 5)],
      NOW,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.entry.url).toBe('https://www.example.org/');
  });
});

describe('inlineCompletion', () => {
  const entries = [
    visit('https://github.com/anthropics/claude', 'Claude', 3),
    visit('https://github.com/', 'GitHub', 10),
    visit('https://gitlab.com/', 'GitLab', 1, 60),
    visit('https://www.google.com/search?q=x', 'x - Search', 2),
  ];

  it('completes the site visited most', () => {
    expect(inlineCompletion('gi', entries, NOW)).toEqual({
      text: 'github.com',
      url: 'https://github.com/',
      title: 'GitHub',
    });
  });

  it('keeps what was typed and its case', () => {
    expect(inlineCompletion('GitL', entries, NOW)?.text).toBe('GitLab.com');
  });

  it('completes whole addresses once a slash is typed', () => {
    expect(inlineCompletion('github.com/an', entries, NOW)).toMatchObject({
      text: 'github.com/anthropics/claude',
      url: 'https://github.com/anthropics/claude',
    });
  });

  it('keeps "www." and a scheme when they are typed', () => {
    expect(inlineCompletion('www.go', entries, NOW)?.text).toBe(
      'www.google.com',
    );
    expect(inlineCompletion('https://gith', entries, NOW)?.text).toBe(
      'https://github.com',
    );
    expect(inlineCompletion('goo', entries, NOW)?.url).toBe(
      'https://www.google.com/',
    );
  });

  it('never completes searches or unknown sites', () => {
    expect(inlineCompletion('git hub', entries, NOW)).toBeNull();
    expect(inlineCompletion('hub', entries, NOW)).toBeNull();
    expect(inlineCompletion('', entries, NOW)).toBeNull();
  });
});

describe('suggestedHistory', () => {
  it('leaves out open pages and rows that read the same', () => {
    const ranked = suggestedHistory(
      'youtube',
      [
        visit('https://www.youtube.com/', 'YouTube', 9),
        visit('https://www.youtube.com/?feature=ytca', 'YouTube', 2),
        visit('https://www.youtube.com/feed/library', 'Library - YouTube', 1),
        visit('https://www.youtube.com/watch?v=1', 'A video', 1),
      ],
      NOW,
      ['https://youtube.com/watch?v=1', null],
    );
    expect(ranked.map((r) => r.entry.url)).toEqual([
      'https://www.youtube.com/',
      'https://www.youtube.com/feed/library',
    ]);
  });
});
