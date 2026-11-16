import { Puzzle } from '../icons';
import type { DetailedHTMLProps } from 'react';
import { useIsPrivate } from '../hooks/use-is-private';
import { useOverlay } from '../stores/overlay-store';
import { EXTENSIONS_BUTTON_ID } from './ExtensionsPopover';

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
 * extension's popup for the page in front; the badge is its count there. The
 * puzzle button after them lists every extension, to turn on or off, set up,
 * remove or add to.
 */
export function ExtensionActions() {
  // A private window's session has no extensions; the toolbar must not offer
  // the regular window's, which would act on pages elsewhere.
  const isPrivate = useIsPrivate();
  const expanded = useOverlay(
    (state) => state.overlay?.kind === 'extensions' && !state.leaving,
  );
  if (isPrivate) return null;
  return (
    <>
      <browser-action-list
        partition={WEB_PARTITION}
        alignment="bottom left"
        aria-label="Extensions"
      />
      <button
        id={EXTENSIONS_BUTTON_ID}
        type="button"
        className="icon-button aria-expanded:bg-row-hover aria-expanded:text-fg"
        aria-label="Extensions"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        title="Extensions"
        onClick={() => {
          const overlay = useOverlay.getState();
          if (expanded) return overlay.close();
          void overlay.open({ kind: 'extensions' }).catch(() => undefined);
        }}
      >
        <Puzzle size={16} />
      </button>
    </>
  );
}
