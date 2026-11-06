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
