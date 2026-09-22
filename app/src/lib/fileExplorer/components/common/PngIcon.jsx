/**
 * PngIcon — renders a black-silhouette PNG from /icons/ when available,
 * falls back to the inline-SVG Icon component otherwise.
 *
 * Safe for fixed-count UI buttons (sidebar rows, toolbar buttons, tabs).
 * NOT for per-row list items where count scales with data (see memory note
 * about decoded-bitmap memory growth).
 */
import Icon from '../../../../Components/Icon';
import { useColoredPng } from '../../../iconRecolor.js';

/** Map Icon names → PNG filename (without extension) in public/icons/.
 *  Only entries with verified PNG files are listed; unmapped names fall
 *  back to the inline-SVG Icon component. */
export const ICON_PNG_MAP = {
  // Locations / system
  HardDrive: 'hard-drive',
  Network: 'network',
  Cloud: 'cloud',
  Server: 'server',
  Globe: 'globe',
  Radio: 'radio',

  // File types
  Folder: 'files',
  Image: 'gallery',
  Film: 'film',
  Music: 'music-note',
  FileText: 'notes',
  Archive: 'archive',
  BrainCircuit: 'cortex',
  Code2: 'code-studio',
  Gamepad2: 'hydrux',
  Snowflake: 'snowflake',
  FileJson: 'file-json',
  BookOpen: 'book-open',
  Library: 'library',

  // People / identity
  User: 'user',
  Users: 'users',
  Accessibility: 'accessibility',

  // Actions / UI buttons
  Upload: 'upload',
  Database: 'database',
  Trash: 'trash',
  Trash2: 'trash-2',
  Delete: 'delete',
  Undo2: 'undo',
  Redo2: 'redo',
  LayoutGrid: 'grid',
  List: 'list',
  FolderPlus: 'folder-plus',
  X: 'x',
  Check: 'check',
  Copy: 'copy',
  Pencil: 'edit-alt',
  Save: 'save',
  Plus: 'plus-small',
  Minus: 'minus',
  Heart: 'heart',

  // Navigation / arrows
  Home: 'house-chimney',
  Monitor: 'computer',
  Download: 'file-download',
  Pin: 'thumbtack',
  ChevronLeft: 'arrow-small-left',
  ChevronRight: 'arrow-small-right',
  ChevronDown: 'arrow-small-down',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
  ArrowLeftRight: 'arrow-left-right',
  ArrowDownToLine: 'arrow-down',
  RotateCw: 'rotate-cw',
  RefreshCw: 'refresh-cw',
  Loader2: 'spinner',
  ExternalLink: 'external-link',

  // Media / playback
  Play: 'play',
  Pause: 'pause',
  SkipBack: 'skip-back',
  SkipForward: 'skip-forward',
  Volume2: 'volume-2',

  // Settings / panels / layout
  Settings: 'settings',
  Settings2: 'settings-alt',
  SlidersHorizontal: 'sliders-horizontal',
  Palette: 'palette',
  PanelLeft: 'panel-left',
  PanelRight: 'panel-right',
  PanelRightClose: 'panel-right-close',
  PanelRightOpen: 'panel-right-open',
  Maximize2: 'maximize',
  Layout: 'layout-fluid',

  // Security / status
  Shield: 'shield',
  ShieldCheck: 'shield-check',
  Lock: 'lock',
  KeyRound: 'key-round',
  Bell: 'bell-simple',
  Eye: 'preview',
  Search: 'search',
  Info: 'info',

  // Code / dev / data
  Code: 'code-icon',
  Terminal: 'terminal',
  Plug2: 'plug',
  Link2: 'link',
  Bookmark: 'bookmark',

  // Misc symbols
  PieChart: 'chart-pie',
  Cpu: 'cpu',
  Zap: 'circle-bolt',
  PackageOpen: 'box-open',
  AlertTriangle: 'triangle-warning',
  Blocks: 'blocks',
  Sparkles: 'sparkles',
  Puzzle: 'puzzle',
  Moon: 'moon',
  Clock: 'clock',
  Activity: 'activity',
  SquareX: 'square-x',
  ShoppingBag: 'shopping-bag',
  Briefcase: 'briefcase',
};

/**
 * Render an icon as PNG if a mapping exists, otherwise as SVG.
 * PNG assets are recolored to the global icon color (Settings → Appearance)
 * via the shared canvas cache; the original black asset is used by default.
 * @param {object} props - Same props as Icon component (name, size, color, className, style, strokeWidth)
 */
export function PngIcon({ name, size = 16, color, className, style, strokeWidth, ...rest }) {
  const pngName = ICON_PNG_MAP[name];
  const colored = useColoredPng(pngName);
  if (pngName) {
    return (
      <img
        src={colored || `/icons/${pngName}.png`}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', ...style }}
        draggable={false}
      />
    );
  }
  return <Icon name={name} size={size} color={color} className={className} style={style} strokeWidth={strokeWidth} {...rest} />;
}
