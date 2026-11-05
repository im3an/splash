import {
  Download,
  Hand,
  Keyboard,
  Layers,
  Paintbrush,
  ScanText,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings' section icons: plain line drawings in the text colour, like
 * the rest of Splash's icons, so they follow the row from muted to selected.
 */
export type SectionIconName =
  | 'general'
  | 'appearance'
  | 'workspaces'
  | 'pages'
  | 'privacy'
  | 'downloads'
  | 'shortcuts'
  | 'advanced';

const ICONS: Record<SectionIconName, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Paintbrush,
  workspaces: Layers,
  pages: ScanText,
  privacy: Hand,
  downloads: Download,
  shortcuts: Keyboard,
  advanced: Settings,
};

export function SectionIcon({
  name,
  size = 16,
}: {
  name: SectionIconName;
  size?: number;
}) {
  const Icon = ICONS[name];
  return <Icon size={size} className="shrink-0" aria-hidden />;
}
