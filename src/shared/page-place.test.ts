import { describe, expect, it } from 'vitest';
import {
  isWorthKeeping,
  mediaResumeTime,
  offersPlace,
  savedMediaFor,
  scrollStep,
  stableMediaSource,
  type MediaPlace,
} from './page-place';

const video = (overrides: Partial<MediaPlace> = {}): MediaPlace => ({
  index: 0,
  src: '',
  time: 90,
  duration: 600,
  playing: true,
  ...overrides,
});

describe('isWorthKeeping', () => {
  const at = (scrollY: number, media: MediaPlace[] = []) => ({
    url: 'https://a.example/',
    scrollX: 0,
    scrollY,
    media,
  });

  it('keeps a scrolled page or one with a video played into', () => {
    expect(isWorthKeeping(at(1200))).toBe(true);
    expect(isWorthKeeping(at(0, [video()]))).toBe(true);
  });

  it('forgets a page at the top with nothing played', () => {
    expect(isWorthKeeping(at(0))).toBe(false);
    expect(isWorthKeeping(at(3, [video({ time: 1 })]))).toBe(false);
  });
});

describe('stableMediaSource', () => {
  it('keeps real addresses and drops ones only this document can use', () => {
    expect(stableMediaSource('https://cdn.example/v.mp4')).toBe(
      'https://cdn.example/v.mp4',
    );
    expect(stableMediaSource('blob:https://www.youtube.com/1234')).toBe('');
    expect(stableMediaSource('data:audio/wav;base64,AAAA')).toBe('');
    expect(stableMediaSource('')).toBe('');
  });
});

describe('offersPlace', () => {
  const url = 'https://a.example/article';

  it('brings back a reloaded or revisited document', () => {
    expect(offersPlace('reload', null, url)).toBe(true);
    expect(offersPlace('back_forward', null, url)).toBe(true);
  });

  it('brings back the document a page is waking at', () => {
    expect(offersPlace('navigate', url, url)).toBe(true);
  });

  it('starts a fresh visit from the top', () => {
    expect(offersPlace('navigate', null, url)).toBe(false);
    expect(offersPlace('navigate', 'https://a.example/other', url)).toBe(false);
  });
});

describe('scrollStep', () => {
  const target = { x: 0, y: 2400 };

  it('scrolls a page still at the top', () => {
    expect(scrollStep({ x: 0, y: 0 }, target, null)).toBe('scroll');
  });

  it('leaves a page something else already moved', () => {
    // A #fragment, or the site remembering by itself.
    expect(scrollStep({ x: 0, y: 900 }, target, null)).toBe('done');
  });

  it('is done once there', () => {
    expect(scrollStep({ x: 0, y: 2398 }, target, { x: 0, y: 1000 })).toBe(
      'done',
    );
  });

  it('keeps going while the page grows towards it', () => {
    // The page was only 1,000 pixels long last time.
    expect(scrollStep({ x: 0, y: 1000 }, target, { x: 0, y: 1000 })).toBe(
      'scroll',
    );
  });

  it('tries again when the site puts the page back to the top', () => {
    expect(scrollStep({ x: 0, y: 0 }, target, { x: 0, y: 2400 })).toBe(
      'scroll',
    );
  });

  it('stops when the page goes somewhere else', () => {
    expect(scrollStep({ x: 0, y: 600 }, target, { x: 0, y: 1000 })).toBe(
      'done',
    );
  });
});

describe('mediaResumeTime', () => {
  const now = { duration: 600, currentTime: 0, src: 'blob:x' };

  it('seeks the same video back to where it was', () => {
    expect(mediaResumeTime(video(), now)).toBe(90);
  });

  it('waits out an ad playing in the same element', () => {
    expect(mediaResumeTime(video(), { ...now, duration: 15 })).toBe('wait');
    expect(mediaResumeTime(video(), { ...now, duration: NaN })).toBe('wait');
  });

  it('waits for the remembered address', () => {
    const saved = video({ src: 'https://cdn.example/a.mp4' });
    expect(
      mediaResumeTime(saved, { ...now, src: 'https://cdn.example/b.mp4' }),
    ).toBe('wait');
    expect(
      mediaResumeTime(saved, { ...now, src: 'https://cdn.example/a.mp4' }),
    ).toBe(90);
  });

  it('leaves a site that chose its own start alone', () => {
    // YouTube's `t=`.
    expect(mediaResumeTime(video(), { ...now, currentTime: 42 })).toBe('skip');
  });

  it('skips a video barely started or already finished', () => {
    expect(mediaResumeTime(video({ time: 1 }), now)).toBe('skip');
    expect(mediaResumeTime(video({ time: 599 }), now)).toBe('skip');
  });
});

describe('savedMediaFor', () => {
  const saved = [
    video({ index: 0, src: 'https://cdn.example/a.mp4' }),
    video({ index: 2, src: '' }),
  ];

  it('finds a video by its address wherever it now is', () => {
    expect(savedMediaFor(saved, 5, 'https://cdn.example/a.mp4')).toBe(saved[0]);
  });

  it('finds a script-made stream by its place in the document', () => {
    expect(savedMediaFor(saved, 2, 'blob:https://x/1')).toBe(saved[1]);
    expect(savedMediaFor(saved, 1, 'blob:https://x/1')).toBeUndefined();
  });

  it('never mistakes another address for a remembered one', () => {
    expect(
      savedMediaFor(saved, 0, 'https://cdn.example/other.mp4'),
    ).toBeUndefined();
  });
});
