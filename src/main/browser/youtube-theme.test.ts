import { expect, it } from 'vitest';
import {
  isYouTubePage,
  needsReload,
  youTubeHasOwnTheme,
} from './youtube-theme';

it('knows YouTube’s own pages, and only those', () => {
  expect(isYouTubePage('https://www.youtube.com/')).toBe(true);
  expect(isYouTubePage('https://m.youtube.com/results?search_query=x')).toBe(
    true,
  );
  expect(isYouTubePage('https://youtube.com/watch?v=1')).toBe(true);
  expect(isYouTubePage('https://music.youtube.com/')).toBe(false);
  expect(isYouTubePage('https://youtube.com.example.com/')).toBe(false);
  expect(isYouTubePage('http://www.youtube.com/')).toBe(false);
  expect(isYouTubePage('nonsense')).toBe(false);
});

it('reads a theme picked in YouTube’s own menu from its PREF cookie', () => {
  expect(youTubeHasOwnTheme(undefined)).toBe(false);
  expect(youTubeHasOwnTheme('f4=4000000&tz=Europe.Berlin')).toBe(false);
  expect(youTubeHasOwnTheme('f6=40000000&tz=Europe.Berlin')).toBe(false);
  expect(youTubeHasOwnTheme('f6=400&tz=Europe.Berlin')).toBe(true);
  expect(youTubeHasOwnTheme('f4=4000000&f6=80000')).toBe(true);
  expect(youTubeHasOwnTheme('f6=40000400')).toBe(true);
});

const page = {
  url: 'https://www.youtube.com/',
  loadedDark: true,
  dark: false,
  pref: 'f4=4000000',
  audible: false,
};

it('reloads a YouTube page that loaded the other way', () => {
  expect(needsReload(page)).toBe(true);
});

it('leaves a page alone when a reload would change nothing or lose something', () => {
  expect(needsReload({ ...page, dark: true })).toBe(false);
  expect(needsReload({ ...page, loadedDark: undefined })).toBe(false);
  expect(needsReload({ ...page, audible: true })).toBe(false);
  expect(needsReload({ ...page, pref: 'f6=400' })).toBe(false);
  expect(needsReload({ ...page, url: 'https://github.com/' })).toBe(false);
});
