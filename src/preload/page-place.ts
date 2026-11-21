import {
  MAX_MEDIA_PLACES,
  mediaResumeTime,
  savedMediaFor,
  scrollStep,
  stableMediaSource,
  type MediaPlace,
  type NavigationKind,
  type PagePlace,
} from '../shared/page-place';

/*
 * Keeps track of where the user is in the page (scroll, videos, sounds) and
 * brings them back there when the page is reloaded, woken or reopened. Runs
 * in the top frame's isolated world; it reads positions and media times, never
 * anything the user typed, and leaves a site that restores itself alone.
 */

export interface PlaceBridge {
  /** How this document came to load; the answer is where it was, if anywhere. */
  ask(url: string, kind: NavigationKind): Promise<PagePlace | null>;
  report(place: PagePlace): void;
}

/** Quiet time after the last change before saying where the user is. */
const REPORT_DELAY_MS = 600;
/** How long the page has to grow long enough to scroll back into. */
const SCROLL_PATIENCE_MS = 10_000;
const SCROLL_STEP_MS = 200;
/** How long a video has to show up (after its ads, say). */
const MEDIA_PATIENCE_MS = 90_000;
/** How long after a seek a site may still put its video back to the start. */
const MEDIA_SETTLE_MS = 1_500;
const MEDIA_ATTEMPTS = 3;

function mediaElements(): HTMLMediaElement[] {
  return [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
}

function navigationKind(): NavigationKind {
  const entry = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? 'navigate';
}

export function installPagePlace(bridge: PlaceBridge): void {
  /** The scroll being brought back; reports say this until it's done. */
  let restoringScroll: { x: number; y: number } | null = null;
  /** Media still waiting to be brought back; reports keep their old times. */
  let restoringMedia: MediaPlace[] = [];
  let userActed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let asked = false;

  const current = (): PagePlace => {
    const elements = mediaElements();
    const media: MediaPlace[] = [];
    elements.forEach((element, index) => {
      if (media.length >= MAX_MEDIA_PLACES) return;
      const { duration, currentTime } = element;
      // Live streams have no place to come back to.
      if (!Number.isFinite(duration) || duration <= 0 || currentTime <= 0)
        return;
      media.push({
        index,
        src: stableMediaSource(element.currentSrc),
        time: currentTime,
        duration,
        playing: !element.paused && !element.ended,
      });
    });
    for (const waiting of restoringMedia) {
      if (media.length >= MAX_MEDIA_PLACES) break;
      if (!media.some((entry) => entry.index === waiting.index))
        media.push(waiting);
    }
    const scroll = restoringScroll ?? { x: window.scrollX, y: window.scrollY };
    return {
      url: location.href,
      scrollX: Math.max(0, Math.round(scroll.x)),
      scrollY: Math.max(0, Math.round(scroll.y)),
      media,
    };
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    // Before the answer, a report would only say "at the top" and lose it.
    if (!asked) return;
    try {
      bridge.report(current());
    } catch {
      /* The frame is going away. */
    }
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, REPORT_DELAY_MS);
  };

  // The user taking over ends any bringing back.
  const acted = (event: Event) => {
    if (!event.isTrusted) return;
    userActed = true;
    restoringScroll = null;
  };
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
    window.addEventListener(type, acted, { capture: true, passive: true });

  window.addEventListener('scroll', schedule, { passive: true });
  for (const type of ['timeupdate', 'play', 'pause', 'seeked', 'ended'])
    window.addEventListener(type, schedule, { capture: true, passive: true });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  const restoreScroll = (target: { x: number; y: number }) => {
    restoringScroll = target;
    const deadline = Date.now() + SCROLL_PATIENCE_MS;
    let last: { x: number; y: number } | null = null;
    const step = () => {
      if (restoringScroll !== target) return;
      const now = { x: window.scrollX, y: window.scrollY };
      if (Date.now() > deadline || scrollStep(now, target, last) === 'done') {
        restoringScroll = null;
        schedule();
        return;
      }
      window.scrollTo({ left: target.x, top: target.y, behavior: 'instant' });
      last = { x: window.scrollX, y: window.scrollY };
      setTimeout(step, SCROLL_STEP_MS);
    };
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', step, { once: true });
    else step();
  };

  const restoreMedia = (saved: MediaPlace[]) => {
    restoringMedia = saved.slice();
    const attempts = new Map<MediaPlace, number>();
    const settle = (place: MediaPlace) => {
      restoringMedia = restoringMedia.filter((entry) => entry !== place);
      schedule();
    };
    const seek = (element: HTMLMediaElement, place: MediaPlace, to: number) => {
      const tries = (attempts.get(place) ?? 0) + 1;
      attempts.set(place, tries);
      element.currentTime = to;
      if (tries === 1 && place.playing && element.paused) {
        // Autoplay settings still apply: a site that may not play stays paused.
        element.play().catch(() => undefined);
      }
      // Some players put a fresh video back to its start once they're ready.
      setTimeout(() => {
        if (!element.isConnected || userActed) return settle(place);
        if (element.currentTime < 1 && tries < MEDIA_ATTEMPTS)
          return seek(element, place, to);
        settle(place);
      }, MEDIA_SETTLE_MS);
    };
    const consider = (element: HTMLMediaElement) => {
      if (element.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const index = mediaElements().indexOf(element);
      const place = savedMediaFor(restoringMedia, index, element.currentSrc);
      if (!place || attempts.has(place)) return;
      if (userActed) return settle(place);
      const verdict = mediaResumeTime(place, {
        duration: element.duration,
        currentTime: element.currentTime,
        src: element.currentSrc,
      });
      if (verdict === 'skip') settle(place);
      else if (verdict !== 'wait') seek(element, place, verdict);
    };
    const loaded = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) consider(event.target);
    };
    window.addEventListener('loadedmetadata', loaded, { capture: true });
    window.addEventListener('durationchange', loaded, { capture: true });
    const scan = () => mediaElements().forEach(consider);
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', scan, { once: true });
    else scan();
    setTimeout(() => {
      window.removeEventListener('loadedmetadata', loaded, { capture: true });
      window.removeEventListener('durationchange', loaded, { capture: true });
      if (restoringMedia.length > 0) {
        restoringMedia = [];
        schedule();
      }
    }, MEDIA_PATIENCE_MS);
  };

  void bridge
    .ask(location.href, navigationKind())
    .catch(() => null)
    .then((place) => {
      asked = true;
      if (place && !userActed) {
        if (place.scrollX > 0 || place.scrollY > 0)
          restoreScroll({ x: place.scrollX, y: place.scrollY });
        if (place.media.length > 0) restoreMedia(place.media);
      }
      schedule();
    });
}
