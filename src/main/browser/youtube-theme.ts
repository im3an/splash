import type { NativeTheme, WebContents } from 'electron';

/*
 * YouTube asks for light or dark once, as it loads, and never again; even
 * its own Appearance menu reloads the page to switch. So when Splash flips
 * between light and dark, a YouTube page that loaded the other way is
 * reloaded, unless that would lose something: a video playing, or one
 * paused partway. Those switch the next time they load. Nor is YouTube
 * reloaded for someone who picked Light or Dark in YouTube's own menu, as
 * it would come back the same.
 */

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/** Wait for the last of a quick run of flips, as when skipping workspaces. */
const SETTLE_MS = 400;

/** Its own world, so the check sees the page's videos and nothing else. */
const CHECK_WORLD = 1014;

/** Played or paused partway, a video would lose its place to a reload. */
const VIDEO_IN_USE = `[...document.querySelectorAll('video')].some(
  (video) => !video.paused || (video.currentTime > 0 && !video.ended),
)`;

export function isYouTubePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether YouTube was told Light or Dark in its own menu, read from its
 * PREF cookie (`f6` holds the flags: 0x400 Dark, 0x80000 Light). With
 * neither, it follows the device, which here is Splash.
 */
export function youTubeHasOwnTheme(pref: string | undefined): boolean {
  if (!pref) return false;
  const flags = Number.parseInt(new URLSearchParams(pref).get('f6') ?? '', 16);
  return Number.isFinite(flags) && (flags & 0x80400) !== 0;
}

/** Whether a YouTube page is due a reload now that Splash is `dark`. */
export function needsReload(page: {
  url: string;
  loadedDark: boolean | undefined;
  dark: boolean;
  pref: string | undefined;
  audible: boolean;
}): boolean {
  return (
    isYouTubePage(page.url) &&
    page.loadedDark !== undefined &&
    page.loadedDark !== page.dark &&
    !page.audible &&
    !youTubeHasOwnTheme(page.pref)
  );
}

interface Options {
  theme: Pick<NativeTheme, 'shouldUseDarkColors' | 'on'>;
  /** Every page that could be showing YouTube. */
  pages(): WebContents[];
}

/**
 * Keeps YouTube pages in step with Splash's light and dark. `track` is
 * called for each page as it's made.
 */
export function keepYouTubeInStep({ theme, pages }: Options): {
  track(contents: WebContents): void;
} {
  const loadedDark = new WeakMap<WebContents, boolean>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reloadIfDue = async (contents: WebContents, dark: boolean) => {
    if (contents.isDestroyed()) return;
    const url = contents.getURL();
    if (!isYouTubePage(url)) return;
    const [pref] = await contents.session.cookies.get({
      url: 'https://www.youtube.com',
      name: 'PREF',
    });
    const due = needsReload({
      url,
      loadedDark: loadedDark.get(contents),
      dark,
      pref: pref?.value,
      audible: contents.isCurrentlyAudible(),
    });
    if (!due) return;
    const inUse: unknown = await contents.executeJavaScriptInIsolatedWorld(
      CHECK_WORLD,
      [{ code: VIDEO_IN_USE }],
    );
    if (inUse === false && !contents.isDestroyed()) contents.reload();
  };

  theme.on('updated', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const dark = theme.shouldUseDarkColors;
      for (const contents of pages()) {
        reloadIfDue(contents, dark).catch(() => {
          // A page that closed or navigated meanwhile keeps what it has.
        });
      }
    }, SETTLE_MS);
  });

  return {
    track(contents) {
      // What YouTube saw is whatever Splash was when its document came up.
      contents.on('dom-ready', () => {
        loadedDark.set(contents, theme.shouldUseDarkColors);
      });
    },
  };
}
