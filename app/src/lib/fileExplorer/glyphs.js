/**
 * Entry glyphs for the file shell — framework-free on purpose.
 *
 * The Preact components (FileItem, FileRow, GalleryVirtualized) and the Solid
 * islands both need the same "which glyph represents this entry" answer, and a
 * Solid file must not import a Preact component to get it. So the rules live
 * here, once.
 *
 * Glyphs stay inline SVG. Rasterising one `<img>` per row multiplies decoded
 * bitmaps across a long list, which is the shape of the memory blow-up this
 * app has already hit twice.
 */
import { iconSvg } from '../iconSvg.js';

// Re-exported so the file-shell islands keep one import site; the serializer
// itself is shared with the Browser and Music islands, which must not reach
// into fileExplorer for it.
export { iconSvg };

/** PNG filenames in public/icons/ that are still used as file-type glyphs. */
export const ICON_PNG_MAP = {
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
};

/** Pick the best Icon name + colour for an entry. */
export function glyphFor(entry) {
  // Virtual .li shortcut entries carry their own icon metadata.
  if (entry.shortcut) {
    return { name: entry.icon || 'ExternalLink', color: entry.color || '#9ca3af' };
  }
  if (entry.cold) return { name: 'Snowflake', color: '#93c5fd' };
  if (entry.ref)  return { name: 'Gamepad2',  color: '#ff6b6b' };

  const ext = (entry.name || '').split('.').pop()?.toLowerCase();

  if (entry.type === 'folder') return { name: 'Folder',     color: '#fbbf24' };
  if (entry.type === 'image')  return { name: 'Image',      color: '#f472b6' };
  if (entry.type === 'video')  return { name: 'Film',       color: '#a78bfa' };

  // Extension-specific icons — same pattern as CodeStudio / Downloader
  switch (ext) {
    case 'mp3': case 'ogg': case 'wav': case 'flac': case 'm4a': case 'aac':
      return { name: 'Music', color: '#f472b6' };
    case 'pdf':
      return { name: 'FileText', color: '#ef4444' };
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
      return { name: 'Archive', color: '#f59e0b' };
    case 'json':
      return { name: 'FileJson', color: '#fbbf24' };
    case 'gguf':
      return { name: 'BrainCircuit', color: '#22d3ee' };
    case 'js': case 'jsx': case 'ts': case 'tsx': case 'py': case 'rs':
    case 'html': case 'css': case 'xml': case 'yaml': case 'yml': case 'toml':
      return { name: 'Code2', color: '#4ade80' };
    case 'csv': case 'xls': case 'xlsx':
      return { name: 'Files', color: '#22c55e' };
    default:
      if (entry.type === 'text') return { name: 'FileText', color: '#60a5fa' };
      return { name: 'FileText', color: '#9ca3af' };
  }
}

/** Registry key of the glyph an entry should show, plus its raster twin. */
function pngSrc(entry) {
  // Virtual .li shortcut entries carry their own PNG icon file.
  if (entry.shortcut && entry.iconFile) {
    return `/icons/${entry.iconFile}.png`;
  }
  const png = ICON_PNG_MAP[glyphFor(entry).name];
  return png ? `/icons/${png}.png` : null;
}

export { pngSrc };

/** Human-readable byte count, shared by the list view and its island. */
export function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
