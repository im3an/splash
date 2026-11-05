import { expect, it } from 'vitest';
import { recentPages } from './StartPage';

const entry = (title: string, url: string) => ({
  title,
  url,
  visitCount: 1,
  lastVisitedAt: 1,
});

it('offers titled pages, each title once, up to the limit', () => {
  expect(
    recentPages([
      entry('', 'https://duckduckgo.com/?q=a'),
      entry('Trail', 'https://a.example/'),
      entry('Trail', 'https://a.example/?b'),
      entry('Road', 'https://b.example/'),
    ]).map((item) => item.url),
  ).toEqual(['https://a.example/', 'https://b.example/']);
  expect(
    recentPages(
      Array.from({ length: 20 }, (_, n) =>
        entry(`Page ${n}`, `https://a.example/${n}`),
      ),
    ),
  ).toHaveLength(8);
});
