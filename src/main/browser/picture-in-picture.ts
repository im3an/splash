import type { WebContents } from 'electron';

export type PictureInPictureResult = 'ok' | 'none' | 'blocked';

/**
 * Runs in each frame. A video already floating comes back; otherwise the one
 * playing, or else the largest, goes out. Isolated world: a page's own script
 * can't see or interfere with this, though the site's refusal still applies.
 */
const TOGGLE = `(async () => {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture();
    return 'ok';
  }
  if (!document.pictureInPictureEnabled) return 'blocked';
  const videos = [...document.querySelectorAll('video')].filter(
    (video) => video.readyState > 0 && video.offsetWidth > 0,
  );
  if (videos.length === 0) return 'none';
  const area = (video) => video.offsetWidth * video.offsetHeight;
  const video = videos.sort(
    (a, b) => Number(a.paused) - Number(b.paused) || area(b) - area(a),
  )[0];
  video.disablePictureInPicture = false;
  await video.requestPictureInPicture();
  return 'ok';
})().catch((error) => (error.name === 'NotAllowedError' ? 'blocked' : 'none'))`;

/** Smaller than this is a preview or a decoration, not what you're watching. */
export const MIN_FLOATING_VIDEO_AREA = 200 * 120;

/**
 * Only what's being watched: playing, with its sound on, and big enough. A
 * muted loop behind a headline isn't, and a site that said no keeps its no.
 */
const FLOAT = `(async () => {
  if (document.pictureInPictureElement) return 'already';
  if (!document.pictureInPictureEnabled) return 'none';
  const area = (video) => video.offsetWidth * video.offsetHeight;
  const video = [...document.querySelectorAll('video')]
    .filter(
      (video) =>
        !video.paused &&
        !video.ended &&
        !video.muted &&
        video.volume > 0 &&
        video.readyState >= 2 &&
        !video.disablePictureInPicture &&
        area(video) >= ${MIN_FLOATING_VIDEO_AREA},
    )
    .sort((a, b) => area(b) - area(a))[0];
  if (!video) return 'none';
  await video.requestPictureInPicture();
  return 'ok';
})().catch(() => 'none')`;

const SINK = `document.pictureInPictureElement
  ? document.exitPictureInPicture().then(() => 'ok', () => 'none')
  : 'none'`;

async function askFrames(
  contents: WebContents,
  script: string,
): Promise<boolean> {
  for (const frame of contents.mainFrame.framesInSubtree) {
    if (frame.isDestroyed()) continue;
    try {
      if ((await frame.executeJavaScript(script, true)) === 'ok') return true;
    } catch {
      // A frame that navigated away while being asked.
    }
  }
  return false;
}

/** Floats the video being watched, if there is one. True if one went out. */
export function floatPlayingVideo(contents: WebContents): Promise<boolean> {
  return askFrames(contents, FLOAT);
}

/** Brings back a video this page has floating. */
export function sinkFloatingVideo(contents: WebContents): Promise<boolean> {
  return askFrames(contents, SINK);
}

/** Floats the page's video above other windows, or brings it back. */
export async function togglePictureInPicture(
  contents: WebContents,
): Promise<PictureInPictureResult> {
  let outcome: PictureInPictureResult = 'none';
  for (const frame of contents.mainFrame.framesInSubtree) {
    if (frame.isDestroyed()) continue;
    try {
      const result = (await frame.executeJavaScript(
        TOGGLE,
        true,
      )) as PictureInPictureResult;
      if (result === 'ok') return 'ok';
      if (result === 'blocked') outcome = 'blocked';
    } catch {
      // A frame that navigated away while being asked.
    }
  }
  return outcome;
}
