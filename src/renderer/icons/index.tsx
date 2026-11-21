/**
 * Splash's icons: Microsoft's Fluent System icons, drawn a little heavier
 * than Fluent's own regular weight, and switching to Fluent's filled
 * drawing when the control they sit in is on.
 *
 * The names are the Lucide names Splash used before, so call sites and
 * stored workspace symbols didn't change. The props are Lucide's too.
 */
import {
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from 'react';
import { FLUENT_PATHS } from './fluent-paths';

export type IconName = keyof typeof FLUENT_PATHS;

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string;
  /** Lucide's line weight. Above 2 it makes the icon bolder; otherwise ignored. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  /** Always draw the filled style, such as the star of a page that's saved. */
  filled?: boolean;
};

export type LucideIcon = ForwardRefExoticComponent<
  IconProps & RefAttributes<SVGSVGElement>
>;

function icon(name: IconName): LucideIcon {
  const [regular, filled] = FLUENT_PATHS[name];
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    {
      size = 24,
      strokeWidth,
      absoluteStrokeWidth: _absolute,
      filled: alwaysFilled,
      fill,
      color,
      className,
      ...rest
    },
    ref,
  ) {
    // Lucide filled a shape by passing fill; that's the filled drawing here.
    const solid = alwaysFilled || (fill !== undefined && fill !== 'none');
    const bold = Number(strokeWidth) > 2;
    const labelled =
      rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="currentColor"
        color={color}
        aria-hidden={labelled ? undefined : true}
        data-icon={name}
        data-filled={solid ? 'true' : undefined}
        data-bold={bold ? 'true' : undefined}
        className={className ? `icon ${className}` : 'icon'}
        {...rest}
      >
        {!solid && (
          <g
            className="icon-regular"
            stroke="currentColor"
            strokeLinejoin="round"
          >
            {regular.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
        <g className="icon-filled">
          {filled.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const Activity = icon('Activity');
export const AppWindow = icon('AppWindow');
export const Archive = icon('Archive');
export const ArrowDown = icon('ArrowDown');
export const ArrowDownToLine = icon('ArrowDownToLine');
export const ArrowLeft = icon('ArrowLeft');
export const ArrowLeftRight = icon('ArrowLeftRight');
export const ArrowRight = icon('ArrowRight');
export const ArrowUp = icon('ArrowUp');
export const Asterisk = icon('Asterisk');
export const Bell = icon('Bell');
export const Blocks = icon('Blocks');
export const Bold = icon('Bold');
export const BookOpen = icon('BookOpen');
export const Bookmark = icon('Bookmark');
export const Briefcase = icon('Briefcase');
export const BrushCleaning = icon('BrushCleaning');
export const Camera = icon('Camera');
export const Check = icon('Check');
export const ChevronDown = icon('ChevronDown');
export const ChevronLeft = icon('ChevronLeft');
export const ChevronRight = icon('ChevronRight');
export const ChevronUp = icon('ChevronUp');
export const ChevronsDownUp = icon('ChevronsDownUp');
export const ChevronsLeft = icon('ChevronsLeft');
export const ChevronsRight = icon('ChevronsRight');
export const ChevronsUpDown = icon('ChevronsUpDown');
export const Circle = icon('Circle');
export const CircleAlert = icon('CircleAlert');
export const CircleHelp = icon('CircleHelp');
export const ClipboardPaste = icon('ClipboardPaste');
export const Clock = icon('Clock');
export const Cloud = icon('Cloud');
export const Code = icon('Code');
export const Code2 = icon('Code2');
export const CodeXml = icon('CodeXml');
export const Coffee = icon('Coffee');
export const Columns2 = icon('Columns2');
export const Copy = icon('Copy');
export const CornerDownRight = icon('CornerDownRight');
export const CreditCard = icon('CreditCard');
export const DatabaseZap = icon('DatabaseZap');
export const Download = icon('Download');
export const Dumbbell = icon('Dumbbell');
export const Egg = icon('Egg');
export const Eraser = icon('Eraser');
export const ExternalLink = icon('ExternalLink');
export const Eye = icon('Eye');
export const EyeOff = icon('EyeOff');
export const File = icon('File');
export const FileArchive = icon('FileArchive');
export const FileCode2 = icon('FileCode2');
export const FileDown = icon('FileDown');
export const FileInput = icon('FileInput');
export const FileOutput = icon('FileOutput');
export const FileText = icon('FileText');
export const Film = icon('Film');
export const FlaskConical = icon('FlaskConical');
export const FolderHeart = icon('FolderHeart');
export const FolderInput = icon('FolderInput');
export const FolderMinus = icon('FolderMinus');
export const FolderOpen = icon('FolderOpen');
const FolderClosed = icon('Folder');
/**
 * A folder, drawn open while what it holds is showing: an unfolded
 * Favorites or Bookmarks folder, a saved group, a bar folder's open menu.
 */
export const Folder = forwardRef<SVGSVGElement, IconProps & { open?: boolean }>(
  function Folder({ open = false, ...props }, ref) {
    return open ? (
      <FolderOpen ref={ref} {...props} />
    ) : (
      <FolderClosed ref={ref} {...props} />
    );
  },
);
export const FolderPlus = icon('FolderPlus');
export const Gamepad2 = icon('Gamepad2');
export const Globe = icon('Globe');
export const GraduationCap = icon('GraduationCap');
export const GripVertical = icon('GripVertical');
export const Hand = icon('Hand');
export const Hash = icon('Hash');
export const Heading1 = icon('Heading1');
export const Heading2 = icon('Heading2');
export const Heading3 = icon('Heading3');
export const Heart = icon('Heart');
export const Highlighter = icon('Highlighter');
export const History = icon('History');
export const Hourglass = icon('Hourglass');
export const House = icon('House');
export const Image = icon('Image');
export const Info = icon('Info');
export const Italic = icon('Italic');
export const KeyRound = icon('KeyRound');
export const Keyboard = icon('Keyboard');
export const Layers = icon('Layers');
export const LayoutGrid = icon('LayoutGrid');
export const Leaf = icon('Leaf');
export const Lightbulb = icon('Lightbulb');
export const Link = icon('Link');
export const Link2 = icon('Link2');
export const List = icon('List');
export const ListChecks = icon('ListChecks');
export const ListEnd = icon('ListEnd');
export const ListFilter = icon('ListFilter');
export const ListMinus = icon('ListMinus');
export const ListOrdered = icon('ListOrdered');
export const ListPlus = icon('ListPlus');
export const ListTree = icon('ListTree');
export const ListX = icon('ListX');
export const LocateFixed = icon('LocateFixed');
export const Lock = icon('Lock');
export const LockKeyhole = icon('LockKeyhole');
export const LockOpen = icon('LockOpen');
export const Mail = icon('Mail');
export const MapPin = icon('MapPin');
export const Maximize = icon('Maximize');
export const Maximize2 = icon('Maximize2');
export const MessageCircle = icon('MessageCircle');
export const MessageSquareQuote = icon('MessageSquareQuote');
export const MessagesSquare = icon('MessagesSquare');
export const Minus = icon('Minus');
export const Moon = icon('Moon');
export const MoreHorizontal = icon('MoreHorizontal');
export const Music = icon('Music');
export const Network = icon('Network');
export const Newspaper = icon('Newspaper');
export const NotebookPen = icon('NotebookPen');
export const Orbit = icon('Orbit');
export const Paintbrush = icon('Paintbrush');
export const Palette = icon('Palette');
export const PanelLeft = icon('PanelLeft');
export const PanelRight = icon('PanelRight');
export const Pause = icon('Pause');
export const PawPrint = icon('PawPrint');
export const PenTool = icon('PenTool');
export const Pencil = icon('Pencil');
export const PencilLine = icon('PencilLine');
export const PictureInPicture2 = icon('PictureInPicture2');
export const Pilcrow = icon('Pilcrow');
export const Pin = icon('Pin');
export const PinOff = icon('PinOff');
export const Plane = icon('Plane');
export const Play = icon('Play');
export const Plus = icon('Plus');
export const Printer = icon('Printer');
export const Puzzle = icon('Puzzle');
export const Quote = icon('Quote');
export const Rocket = icon('Rocket');
export const RotateCcw = icon('RotateCcw');
export const RotateCw = icon('RotateCw');
export const Route = icon('Route');
export const Scaling = icon('Scaling');
export const ScanText = icon('ScanText');
export const Search = icon('Search');
export const SearchX = icon('SearchX');
export const Settings = icon('Settings');
export const Settings2 = icon('Settings2');
export const Share = icon('Share');
export const ShieldOff = icon('ShieldOff');
export const ShieldQuestion = icon('ShieldQuestion');
export const ShoppingBag = icon('ShoppingBag');
export const Sigma = icon('Sigma');
export const Signpost = icon('Signpost');
export const Skull = icon('Skull');
export const SlidersHorizontal = icon('SlidersHorizontal');
export const Smile = icon('Smile');
export const SmilePlus = icon('SmilePlus');
export const Sparkles = icon('Sparkles');
export const Sprout = icon('Sprout');
export const Square = icon('Square');
export const SquareFunction = icon('SquareFunction');
export const SquareTerminal = icon('SquareTerminal');
export const Star = icon('Star');
export const StickyNote = icon('StickyNote');
export const Store = icon('Store');
export const Strikethrough = icon('Strikethrough');
export const Table = icon('Table');
export const Target = icon('Target');
export const TextSearch = icon('TextSearch');
export const Triangle = icon('Triangle');
export const TriangleAlert = icon('TriangleAlert');
export const Trash2 = icon('Trash2');
export const Type = icon('Type');
export const Underline = icon('Underline');
export const Undo2 = icon('Undo2');
export const Ungroup = icon('Ungroup');
export const Unlink = icon('Unlink');
export const Users = icon('Users');
export const Utensils = icon('Utensils');
export const Volume2 = icon('Volume2');
export const VolumeX = icon('VolumeX');
export const Wallet = icon('Wallet');
export const Weight = icon('Weight');
export const Wrench = icon('Wrench');
export const X = icon('X');
export const Zap = icon('Zap');
export const ZoomIn = icon('ZoomIn');
export const ZoomOut = icon('ZoomOut');
