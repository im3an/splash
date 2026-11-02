import {
  Asterisk,
  Bell,
  BookOpen,
  Bookmark,
  Briefcase,
  Camera,
  Circle,
  Cloud,
  Code,
  Coffee,
  Dumbbell,
  Egg,
  Film,
  FlaskConical,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Lightbulb,
  MessageCircle,
  Moon,
  Music,
  Newspaper,
  Orbit,
  Palette,
  PawPrint,
  Plane,
  Rocket,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Triangle,
  Users,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { SYMBOLS } from '../../shared/appearance';
import type { WorkspaceIcon as Icon } from '../../shared/types';

export const SYMBOL_ICONS: Record<(typeof SYMBOLS)[number], LucideIcon> = {
  star: Star,
  bookmark: Bookmark,
  heart: Heart,
  zap: Zap,
  triangle: Triangle,
  asterisk: Asterisk,
  bell: Bell,
  lightbulb: Lightbulb,
  'message-circle': MessageCircle,
  users: Users,
  wrench: Wrench,
  egg: Egg,
  circle: Circle,
  moon: Moon,
  orbit: Orbit,
  leaf: Leaf,
  cloud: Cloud,
  'paw-print': PawPrint,
  utensils: Utensils,
  plane: Plane,
  music: Music,
  'gamepad-2': Gamepad2,
  code: Code,
  skull: Skull,
  house: House,
  briefcase: Briefcase,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  'flask-conical': FlaskConical,
  palette: Palette,
  camera: Camera,
  film: Film,
  newspaper: Newspaper,
  globe: Globe,
  coffee: Coffee,
  'shopping-bag': ShoppingBag,
  wallet: Wallet,
  rocket: Rocket,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
};

/**
 * Symbols drawn solid, like Arc's: closed shapes read better filled at
 * sidebar size. The rest are line drawings that a fill would blot out.
 */
const FILLED = new Set<string>([
  'star',
  'bookmark',
  'heart',
  'zap',
  'triangle',
  'bell',
  'lightbulb',
  'message-circle',
  'users',
  'egg',
  'circle',
  'moon',
  'leaf',
  'cloud',
  'paw-print',
  'plane',
  'music',
  'sparkles',
]);

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
        <Symbol
          size={size}
          strokeWidth={1.75}
          fill={FILLED.has(icon.name) ? 'currentColor' : 'none'}
          className="workspace-symbol"
          aria-hidden
        />
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
          className="rounded-mark object-cover"
        />
      );
    default:
      return <span aria-hidden>{initialOf(name)}</span>;
  }
}
