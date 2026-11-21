// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PagePlace } from '../shared/page-place';
import { installPagePlace } from './page-place';

/** jsdom lays nothing out: scrolling just records where it was asked to go. */
let scroll = { x: 0, y: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  scroll = { x: 0, y: 0 };
  vi.spyOn(window, 'scrollX', 'get').mockImplementation(() => scroll.x);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scroll.y);
  window.scrollTo = ((options: ScrollToOptions) => {
    scroll = { x: options.left ?? 0, y: options.top ?? 0 };
  }) as typeof window.scrollTo;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function bridge(answer: PagePlace | null) {
  const reports: PagePlace[] = [];
  const asks: { url: string; kind: string }[] = [];
  return {
    reports,
    asks,
    ask: (url: string, kind: string) => {
      asks.push({ url, kind });
      return Promise.resolve(answer);
    },
    report: (place: PagePlace) => reports.push(place),
  };
}

/** A video that has loaded this far, as a real one would say. */
function addVideo(duration: number, currentTime = 0): HTMLVideoElement {
  const video = document.createElement('video');
  let time = currentTime;
  Object.defineProperties(video, {
    readyState: { get: () => 1 },
    duration: { get: () => duration },
    currentSrc: { get: () => 'blob:https://video.example/1' },
    paused: { get: () => true, configurable: true },
    currentTime: {
      get: () => time,
      set: (value: number) => {
        time = value;
      },
    },
  });
  video.play = vi.fn(() => Promise.resolve());
  document.body.append(video);
  return video;
}

const PLACE = (media: PagePlace['media'] = []): PagePlace => ({
  url: location.href,
  scrollX: 0,
  scrollY: 2400,
  media,
});

describe('installPagePlace', () => {
  it('asks once, saying how the document loaded', async () => {
    const page = bridge(null);
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.asks).toEqual([{ url: location.href, kind: 'navigate' }]);
  });

  it('reports where the user scrolled to', async () => {
    const page = bridge(null);
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(1000);
    scroll = { x: 0, y: 1500 };
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.reports.at(-1)).toMatchObject({ scrollY: 1500, media: [] });
  });

  it('scrolls back to where the user was', async () => {
    const page = bridge(PLACE());
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(scroll.y).toBe(2400);
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.reports.at(-1)).toMatchObject({ scrollY: 2400 });
  });

  it('keeps saying the old place while the page is still coming back', async () => {
    const page = bridge(PLACE());
    // The page reaches only 1,000 pixels down for now.
    window.scrollTo = ((options: ScrollToOptions) => {
      scroll = { x: 0, y: Math.min(options.top ?? 0, 1000) };
    }) as typeof window.scrollTo;
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(page.reports.at(-1)).toMatchObject({ scrollY: 2400 });
  });

  it('takes a video back to where it was and plays it again', async () => {
    const video = addVideo(600);
    const page = bridge(
      PLACE([{ index: 0, src: '', time: 90, duration: 600, playing: true }]),
    );
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(video.currentTime).toBe(90);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('waits for the video itself when an ad plays first', async () => {
    const ad = addVideo(15);
    const page = bridge(
      PLACE([{ index: 0, src: '', time: 90, duration: 600, playing: false }]),
    );
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(ad.currentTime).toBe(0);
  });

  it('leaves a video the site started somewhere itself', async () => {
    const video = addVideo(600, 42);
    const page = bridge(
      PLACE([{ index: 0, src: '', time: 90, duration: 600, playing: false }]),
    );
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(video.currentTime).toBe(42);
  });

  it('reports a video played into, and whether it plays', async () => {
    const video = addVideo(600, 75);
    Object.defineProperty(video, 'paused', { get: () => false });
    const page = bridge(null);
    installPagePlace(page);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(page.reports.at(-1)!.media).toEqual([
      { index: 0, src: '', time: 75, duration: 600, playing: true },
    ]);
  });
});
