import {
  BookOpen,
  Briefcase,
  Camera,
  Code,
  Coffee,
  Dumbbell,
  Film,
  FlaskConical,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Music,
  Newspaper,
  Palette,
  Plane,
  Rocket,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { SYMBOLS } from '../../shared/appearance';
import type { WorkspaceIcon as Icon } from '../../shared/types';

export const SYMBOL_ICONS: Record<(typeof SYMBOLS)[number], LucideIcon> = {
  house: House,
  briefcase: Briefcase,
  code: Code,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  'flask-conical': FlaskConical,
  palette: Palette,
  camera: Camera,
  music: Music,
  film: Film,
  'gamepad-2': Gamepad2,
  newspaper: Newspaper,
  plane: Plane,
  globe: Globe,
  leaf: Leaf,
  coffee: Coffee,
  'shopping-bag': ShoppingBag,
  wallet: Wallet,
  heart: Heart,
  star: Star,
  rocket: Rocket,
  sparkles: Sparkles,
  users: Users,
  dumbbell: Dumbbell,
};

export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '•';
}

/** A workspace's mark: its initial, a symbol, an emoji or a small image. */
export function WorkspaceIcon({
  icon,
  name,
  size = 14,
}: {
  icon: Icon;
  name: string;
  size?: number;
}) {
  switch (icon.kind) {
    case 'symbol': {
      const Symbol = SYMBOL_ICONS[icon.name as keyof typeof SYMBOL_ICONS];
      return Symbol ? (
        <Symbol size={size} strokeWidth={1.75} aria-hidden />
      ) : (
        <span aria-hidden>{initialOf(name)}</span>
      );
    }
    case 'emoji':
      return (
        <span aria-hidden style={{ fontSize: size + 1, lineHeight: 1 }}>
          {icon.value}
        </span>
      );
    case 'image':
      return (
        <img
          src={icon.dataUrl}
          alt=""
          width={size + 2}
          height={size + 2}
          draggable={false}
          className="rounded-[4px] object-cover"
        />
      );
    default:
      return <span aria-hidden>{initialOf(name)}</span>;
  }
}
