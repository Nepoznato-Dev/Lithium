/**
 * PngIcon — renders a black-silhouette PNG from /icons/ when available,
 * falls back to the inline-SVG Icon component otherwise.
 *
 * Safe for fixed-count UI buttons (sidebar rows, toolbar buttons, tabs).
 * NOT for per-row list items where count scales with data (see memory note
 * about decoded-bitmap memory growth).
 */
import Icon from '../../../../Components/Icon';
import { iconUrl } from '../../../iconUrl.js';

/** Map Icon names → PNG filename (without extension) in public/icons/.
 *  Only entries with verified PNG files are listed; unmapped names fall
 *  back to the inline-SVG Icon component. */
export const ICON_PNG_MAP = {
  // Locations / system
  HardDrive: 'hard-drive',
  Network: 'network',
  Cloud: 'cloud',

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

  // Actions / UI buttons
  Upload: 'upload',
  Database: 'database',
  Trash: 'trash',
  Trash2: 'trash-2',
  Undo2: 'undo',
  LayoutGrid: 'grid',
  List: 'list',
  FolderPlus: 'folder-plus',
  X: 'x',

  // Navigation / sidebar
  Home: 'house-chimney',
  Monitor: 'computer',
  Download: 'file-download',
  Pin: 'thumbtack',
  ChevronLeft: 'arrow-small-left',
  ChevronRight: 'arrow-small-right',
  ChevronDown: 'arrow-small-down',
  Plus: 'plus-small',
  Pencil: 'edit-alt',
  RefreshCw: 'refresh-cw',
  Loader2: 'spinner',

  // Storage panel / dialogs
  Layout: 'layout-fluid',
  PieChart: 'chart-pie',
  Cpu: 'cpu',
  Zap: 'circle-bolt',
  PackageOpen: 'box-open',
  AlertTriangle: 'triangle-warning',
  ArrowDownToLine: 'arrow-down',
  Eye: 'preview',
};

/**
 * Render an icon as PNG if a mapping exists, otherwise as SVG.
 * @param {object} props - Same props as Icon component (name, size, color, className, style, strokeWidth)
 */
export function PngIcon({ name, size = 16, color, className, style, strokeWidth, ...rest }) {
  const pngName = ICON_PNG_MAP[name];
  if (pngName) {
    return (
      <img
        src={iconUrl(pngName)}
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
