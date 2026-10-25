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
