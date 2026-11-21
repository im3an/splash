/**
 * Where the user was in a page: how far it was scrolled and where its videos
 * and sounds were. The page's preload reports it; the main process keeps it
 * with the page's history, so a reload, a page woken from sleep or a relaunch
 * can bring the user back. Zod-free, for the preload bundle.
 */

/** At most this many media elements are remembered per page. */
export const MAX_MEDIA_PLACES = 8;
/** At most this many addresses are remembered per trail page. */
export const MAX_PLACES_PER_PAGE = 20;
/** Less scroll than this is "at the top": nothing to bring back. */
export const SCROLL_TOLERANCE = 8;
/** A video less far in than this was barely started. */
const MIN_MEDIA_TIME = 3;
/** Nor is one this close to its end worth going back into. */
const END_MARGIN = 3;
/** A site that already started its video further in than this chose where. */
const SITE_STARTED_AT = 1.5;
/** How far the duration may differ and still be the same video. */
const DURATION_SLACK = 2;

/** A `<video>` or `<audio>` element and how far it had played. */
export interface MediaPlace {
  /** Its position among the document's media elements. */
  index: number;
  /** Its address, or `''` for a stream made by script (`blob:`), as YouTube's. */
  src: string;
  /** Seconds in. */
  time: number;
  /** Seconds long: tells the video from an ad played in the same element. */
  duration: number;
  playing: boolean;
}

export interface PagePlace {
  /** The document's address when this was taken. */
  url: string;
  scrollX: number;
  scrollY: number;
  media: MediaPlace[];
}

/** How the document came to load, as Navigation Timing says. */
export type NavigationKind = 'navigate' | 'reload' | 'back_forward' | string;

/** A place worth keeping: scrolled, or with something played into. */
export function isWorthKeeping(place: PagePlace): boolean {
  return (
    place.scrollY >= SCROLL_TOLERANCE ||
    place.scrollX >= SCROLL_TOLERANCE ||
    place.media.some((media) => media.time >= MIN_MEDIA_TIME)
  );
}

/** A media element's address, unless it's one only this document can use. */
export function stableMediaSource(src: string): string {
  if (!src || src.length > 2048) return '';
  return /^(blob|data|mediastream):/i.test(src) ? '' : src;
}

/**
 * Whether a document gets its place back: one the user reloaded or came back
 * to (woken, relaunched, back/forward), at the very address it was taken at.
 * A link or typed address leads to the page afresh, from the top.
 */
export function offersPlace(
  kind: NavigationKind,
  returningTo: string | null,
  url: string,
): boolean {
  return kind === 'reload' || kind === 'back_forward' || returningTo === url;
}

export interface Point {
  x: number;
  y: number;
}

function near(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) < SCROLL_TOLERANCE &&
    Math.abs(a.y - b.y) < SCROLL_TOLERANCE
  );
}

/**
 * One step of bringing the scroll back, while the page's content arrives.
 * `last` is where the previous step left the page (`null` before the first).
 * - `scroll`: go to the target (again: the page may have grown since).
 * - `done`: it's there, or the page or the user moved it elsewhere.
 */
export function scrollStep(
  current: Point,
  target: Point,
  last: Point | null,
): 'scroll' | 'done' {
  if (near(current, target)) return 'done';
  const origin = { x: 0, y: 0 };
  // Something else put the page here: a #fragment, the site's own memory.
  if (last === null) return near(current, origin) ? 'scroll' : 'done';
  // Still where the last step left it (the page wasn't long enough yet), or
  // the site reset it to the top while it rendered.
  if (near(current, last) || near(current, origin)) return 'scroll';
  return 'done';
}

/** What a media element shows right now. */
export interface MediaNow {
  duration: number;
  currentTime: number;
  src: string;
}

/**
 * Where to take a media element that's ready to play.
 * - a number: seek there.
 * - `wait`: not this video yet (an ad first, say); try its next one.
 * - `skip`: nothing to do: it's barely started, finished, or the site
 *   already chose a starting point of its own (YouTube's `t=`).
 */
export function mediaResumeTime(
  saved: MediaPlace,
  now: MediaNow,
): number | 'wait' | 'skip' {
  if (saved.time < MIN_MEDIA_TIME || saved.time > saved.duration - END_MARGIN)
    return 'skip';
  if (!Number.isFinite(now.duration) || now.duration <= 0) return 'wait';
  const source = stableMediaSource(now.src);
  if (saved.src && source && source !== saved.src) return 'wait';
  if (Math.abs(now.duration - saved.duration) > DURATION_SLACK) return 'wait';
  if (now.currentTime > SITE_STARTED_AT) return 'skip';
  return saved.time;
}

/** The remembered media this element is, if any: by address, else by place. */
export function savedMediaFor(
  saved: MediaPlace[],
  index: number,
  src: string,
): MediaPlace | undefined {
  const source = stableMediaSource(src);
  return (
    (source ? saved.find((media) => media.src === source) : undefined) ??
    saved.find((media) => media.index === index && (!media.src || !source))
  );
}
