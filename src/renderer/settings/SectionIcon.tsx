import type { ReactNode } from 'react';

/**
 * Settings' section icons on a 20-unit grid, drawn in the text colour: a
 * faint body (`duo-soft`) under a solid detail. See `.duo-icon` in app.css.
 */
export type SectionIconName =
  | 'general'
  | 'appearance'
  | 'workspaces'
  | 'privacy'
  | 'downloads'
  | 'shortcuts'
  | 'advanced';

const SHAPES: Record<SectionIconName, ReactNode> = {
  // Two sliders on a card.
  general: (
    <>
      <rect className="duo-soft" x="2" y="2.5" width="16" height="15" rx="4" />
      <rect x="5" y="6.4" width="10" height="1.6" rx="0.8" />
      <rect x="5" y="12" width="10" height="1.6" rx="0.8" />
      <circle cx="8" cy="7.2" r="2.3" />
      <circle cx="12.4" cy="12.8" r="2.3" />
    </>
  ),
  // Two swatches, the front one with a drop of colour.
  appearance: (
    <>
      <rect x="2" y="2.5" width="11" height="11" rx="3" />
      <rect className="duo-soft" x="7" y="6.5" width="11" height="11" rx="3" />
      <circle cx="12.5" cy="12" r="2.4" />
    </>
  ),
  // A stack of spaces, the front one open.
  workspaces: (
    <>
      <rect x="5.5" y="2.5" width="9" height="2.6" rx="1.3" opacity="0.55" />
      <rect x="3.8" y="5.4" width="12.4" height="2.8" rx="1.4" />
      <rect className="duo-soft" x="2" y="8.6" width="16" height="9" rx="3" />
      <rect x="5" y="12.2" width="6" height="1.8" rx="0.9" />
    </>
  ),
  // A shield, its right half in full colour.
  privacy: (
    <>
      <path
        className="duo-soft"
        d="M10 2 16.5 4.6v5c0 4-2.8 7-6.5 8.4C6.3 16.6 3.5 13.6 3.5 9.6v-5Z"
      />
      <path d="M10 2 16.5 4.6v5c0 4-2.8 7-6.5 8.4Z" />
    </>
  ),
  // An arrow down into a tray.
  downloads: (
    <>
      <rect
        className="duo-soft"
        x="2"
        y="10.5"
        width="16"
        height="7"
        rx="2.6"
      />
      <rect x="8.9" y="2.5" width="2.2" height="8.5" rx="1.1" />
      <path
        d="M6.2 8.4 10 12.4l3.8-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect x="5" y="14.3" width="4" height="1.5" rx="0.75" />
    </>
  ),
  // A keyboard.
  shortcuts: (
    <>
      <rect
        className="duo-soft"
        x="1.5"
        y="4.5"
        width="17"
        height="11"
        rx="3"
      />
      <rect x="4.5" y="7.4" width="2.2" height="2.2" rx="0.7" />
      <rect x="8.9" y="7.4" width="2.2" height="2.2" rx="0.7" />
      <rect x="13.3" y="7.4" width="2.2" height="2.2" rx="0.7" />
      <rect x="6" y="11.4" width="8" height="1.9" rx="0.95" />
    </>
  ),
  // A chip.
  advanced: (
    <>
      <rect className="duo-soft" x="4" y="4" width="12" height="12" rx="3" />
      <rect x="7.3" y="7.3" width="5.4" height="5.4" rx="1.3" />
      <rect x="7" y="1.5" width="1.6" height="3" rx="0.8" />
      <rect x="11.4" y="1.5" width="1.6" height="3" rx="0.8" />
      <rect x="7" y="15.5" width="1.6" height="3" rx="0.8" />
      <rect x="11.4" y="15.5" width="1.6" height="3" rx="0.8" />
      <rect x="1.5" y="7" width="3" height="1.6" rx="0.8" />
      <rect x="1.5" y="11.4" width="3" height="1.6" rx="0.8" />
      <rect x="15.5" y="7" width="3" height="1.6" rx="0.8" />
      <rect x="15.5" y="11.4" width="3" height="1.6" rx="0.8" />
    </>
  ),
};

export function SectionIcon({
  name,
  size = 18,
}: {
  name: SectionIconName;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden
      className="duo-icon"
    >
      {SHAPES[name]}
    </svg>
  );
}
