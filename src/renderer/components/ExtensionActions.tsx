import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Defined by the preload from electron-chrome-extensions. */
      'browser-action-list': DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { partition?: string; alignment?: string };
    }
  }
}

/** Must match `WEB_PARTITION`, where pages and their extensions live. */
const WEB_PARTITION = 'persist:web';

/**
 * Toolbar buttons of extensions such as uBlock Origin. A click opens the
 * extension's popup for the page in front; the badge is its count there.
 */
export function ExtensionActions() {
  return (
    <browser-action-list
      partition={WEB_PARTITION}
      alignment="bottom left"
      aria-label="Extensions"
    />
  );
}
