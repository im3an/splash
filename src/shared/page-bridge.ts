/**
 * Messages a web page's preload may send. Kept zod-free for the preload
 * bundle.
 */

/**
 * "The user just activated a link to this address". It lets the main process
 * tell a real link click (which branches the trail) from redirects, form
 * posts and script navigations (which stay in place).
 */
export const LINK_ACTIVATED = 'page:link-activated';

/** Autoconsent in a frame asking for its rules or to run a rule step. */
export const AUTOCONSENT = 'page:autoconsent';

/** A mouse's back or forward button was pressed inside the page. */
export const NAVIGATION_BUTTON = 'page:navigation-button';

/** A trusted input/change event occurred; never includes field values. */
export const FORM_EDITED = 'page:form-edited';

/** An eligible ordinary click whose default navigation the preload canceled. */
export const BRANCH_LINK = 'page:branch-link';

/** The user clicked or pressed a key inside a frame; carries nothing else. */
export const FRAME_GESTURE = 'page:frame-gesture';

/** A link was dropped on the page and nothing in the page took it. */
export const LINK_DROPPED = 'page:link-dropped';

/** A new frame asking, once and synchronously, what applies to it. */
export const PAGE_SETTINGS = 'page:settings';

/** What a frame's preload has to enforce itself, before the page's scripts. */
export interface PageSettings {
  /** Tell scripts what the request headers already say. */
  privacySignal: boolean;
  /** This frame belongs to another site, and may not use its cookies. */
  blockCookies: boolean;
  /** Media waits until the user has touched the page. */
  blockAutoplay: boolean;
  /** No script will run, so `<noscript>` content has to show. */
  blockScripts: boolean;
  /**
   * Permissions, by the name the web knows them by, this frame's site hasn't
   * been answered about. Chromium can only say granted or denied, so without
   * this a site that checks first would think the user had refused.
   */
  undecided: string[];
}
