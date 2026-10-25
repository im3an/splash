/**
 * The one message a web page's preload may send: "the user just activated a
 * link to this address". It lets the main process tell a real link click
 * (which branches the trail) from redirects, form posts and script
 * navigations (which stay in place). Kept zod-free for the preload bundle.
 */
export const LINK_ACTIVATED = 'page:link-activated';
