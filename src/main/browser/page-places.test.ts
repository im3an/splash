import { describe, expect, it } from 'vitest';
import { MAX_PLACES_PER_PAGE, type PagePlace } from '../../shared/page-place';
import { PagePlaces } from './page-places';

const ARTICLE = 'https://news.example/story';

function place(url = ARTICLE, scrollY = 2400): PagePlace {
  return { url, scrollX: 0, scrollY, media: [] };
}

describe('PagePlaces', () => {
  it('gives a reloaded document its place back', () => {
    const places = new PagePlaces();
    places.remember(place());
    expect(places.ask(ARTICLE, 'reload')).toEqual(place());
  });

  it('starts a fresh visit to the same address from the top', () => {
    const places = new PagePlaces();
    places.remember(place());
    expect(places.ask(ARTICLE, 'navigate')).toBeNull();
  });

  it('gives a waking page its place, once', () => {
    const places = new PagePlaces();
    places.remember(place());
    places.returnTo(ARTICLE);
    expect(places.ask(ARTICLE, 'navigate')).toEqual(place());
    expect(places.ask(ARTICLE, 'navigate')).toBeNull();
  });

  it('forgets the return when the user goes somewhere new', () => {
    const places = new PagePlaces();
    places.remember(place());
    places.returnTo(ARTICLE);
    places.leave();
    expect(places.ask(ARTICLE, 'navigate')).toBeNull();
  });

  it('forgets a place once the user is back at the top', () => {
    const places = new PagePlaces();
    places.remember(place());
    places.remember(place(ARTICLE, 0));
    expect(places.ask(ARTICLE, 'reload')).toBeNull();
  });

  it('keeps only places for addresses still in the history', () => {
    const places = new PagePlaces();
    places.remember(place('https://a.example/'));
    places.remember(place('https://b.example/'));
    expect(places.export(['https://b.example/'])).toEqual([
      place('https://b.example/'),
    ]);
  });

  it('keeps a bounded number, dropping the oldest', () => {
    const places = new PagePlaces();
    for (let i = 0; i <= MAX_PLACES_PER_PAGE; i++)
      places.remember(place(`https://a.example/${i}`));
    places.remember(place('https://a.example/1', 500));
    const urls = Array.from(
      { length: MAX_PLACES_PER_PAGE + 1 },
      (_, i) => `https://a.example/${i}`,
    );
    const kept = places.export(urls).map((entry) => entry.url);
    expect(kept).toHaveLength(MAX_PLACES_PER_PAGE);
    expect(kept).not.toContain('https://a.example/0');
    // Seen again, so it's the most recent now.
    expect(kept.at(-1)).toBe('https://a.example/1');
  });

  it('takes back places saved with a history, as a page wakes', () => {
    const asleep = new PagePlaces();
    asleep.remember(place());
    const saved = asleep.export([ARTICLE]);
    const awake = new PagePlaces();
    awake.seed(saved);
    awake.returnTo(ARTICLE);
    expect(awake.ask(ARTICLE, 'navigate')).toEqual(place());
  });
});
