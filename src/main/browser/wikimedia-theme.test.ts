import { expect, it } from 'vitest';
import { automaticThemeCookie, wikimediaWiki } from './wikimedia-theme';

it('names the wiki an address belongs to, as Wikimedia does', () => {
  expect(wikimediaWiki('https://en.wikipedia.org/wiki/Hokusai')).toBe('enwiki');
  expect(wikimediaWiki('https://en.m.wikipedia.org/wiki/Hokusai')).toBe(
    'enwiki',
  );
  expect(wikimediaWiki('https://de.wiktionary.org/wiki/Welle')).toBe(
    'dewiktionary',
  );
  expect(wikimediaWiki('https://zh-yue.wikipedia.org/')).toBe('zh_yuewiki');
  expect(wikimediaWiki('https://be-tarask.wikipedia.org/')).toBe(
    'be_x_oldwiki',
  );
  expect(wikimediaWiki('https://commons.wikimedia.org/wiki/Main_Page')).toBe(
    'commonswiki',
  );
});

it('leaves every other address alone', () => {
  for (const url of [
    'https://www.wikipedia.org/',
    'https://wikipedia.org/',
    'http://en.wikipedia.org/wiki/Hokusai',
    'https://en.wikipedia.org.example.com/',
    'https://foundation.wikimedia.org/',
    'https://en.wikipedia.com/',
    'https://youtube.com/',
    'not a url',
  ]) {
    expect(wikimediaWiki(url)).toBeNull();
  }
});

const url = 'https://en.wikipedia.org/wiki/Hokusai';

it('turns on Automatic for a reader who never picked a theme', () => {
  expect(automaticThemeCookie(url, [])).toEqual({
    name: 'enwikimwclientpreferences',
    value: 'skin-theme-clientpref-os',
  });
});

it('keeps the reader’s other choices', () => {
  expect(
    automaticThemeCookie(url, [
      {
        name: 'enwikimwclientpreferences',
        value: 'vector-feature-limited-width-clientpref-0',
      },
    ]),
  ).toEqual({
    name: 'enwikimwclientpreferences',
    value:
      'vector-feature-limited-width-clientpref-0%2Cskin-theme-clientpref-os',
  });
});

it('never replaces a theme the reader picked', () => {
  for (const value of [
    'skin-theme-clientpref-day',
    'skin-theme-clientpref-night',
    'vector-feature-limited-width-clientpref-0%2Cskin-theme-clientpref-day',
  ]) {
    expect(
      automaticThemeCookie(url, [{ name: 'enwikimwclientpreferences', value }]),
    ).toBeNull();
  }
});

it('leaves a signed-in reader to their account’s setting', () => {
  expect(
    automaticThemeCookie(url, [{ name: 'centralauth_User', value: 'Ada' }]),
  ).toBeNull();
  expect(
    automaticThemeCookie(url, [{ name: 'enwikiUserID', value: '7' }]),
  ).toBeNull();
});
