import {
  ArrowLeftRight,
  Download,
  Hand,
  Info,
  KeyRound,
  Keyboard,
  Layers,
  Paintbrush,
  Puzzle,
  ScanText,
  Settings,
  Signpost,
  SlidersHorizontal,
  type LucideIcon,
} from '../icons';

/**
 * Settings' section icons: plain line drawings in the text colour, like
 * the rest of Splash's icons, so they follow the row from muted to selected.
 */
export type SectionIconName =
  | 'general'
  | 'waymarks'
  | 'extensions'
  | 'appearance'
  | 'workspaces'
  | 'pages'
  | 'privacy'
  | 'passwords'
  | 'transfer'
  | 'downloads'
  | 'shortcuts'
  | 'advanced'
  | 'about';

const ICONS: Record<SectionIconName, LucideIcon> = {
  general: SlidersHorizontal,
  waymarks: Signpost,
  extensions: Puzzle,
  appearance: Paintbrush,
  workspaces: Layers,
  pages: ScanText,
  privacy: Hand,
  passwords: KeyRound,
  transfer: ArrowLeftRight,
  downloads: Download,
  shortcuts: Keyboard,
  advanced: Settings,
  about: Info,
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
