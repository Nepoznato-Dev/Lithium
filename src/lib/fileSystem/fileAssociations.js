/**
 * File-type associations for Lithium OS.
 *
 * Maps file extensions to the default desktop app that should open them.
 * Used by FileExplorer's "Open with" context menu and by the FS layer when
 * double-clicking a file.
 *
 * Each entry:  extension → { appId, label }
 *   appId  — id in the app registry (see useDesktopState apps array)
 *   label  — human-readable description shown in the UI
 */

export const FILE_ASSOCIATIONS = {
  // ── Text / Code ──────────────────────────────────────────────────────
  '.md':    { appId: 'notepad',      label: 'Notes' },
  '.txt':   { appId: 'notepad',      label: 'Notes' },
  '.json':  { appId: 'code-studio',  label: 'Code Studio' },
  '.js':    { appId: 'code-studio',  label: 'Code Studio' },
  '.jsx':   { appId: 'code-studio',  label: 'Code Studio' },
  '.ts':    { appId: 'code-studio',  label: 'Code Studio' },
  '.tsx':   { appId: 'code-studio',  label: 'Code Studio' },
  '.py':    { appId: 'code-studio',  label: 'Code Studio' },
  '.rs':    { appId: 'code-studio',  label: 'Code Studio' },
  '.html':  { appId: 'browser',      label: 'Browser' },
  '.css':   { appId: 'code-studio',  label: 'Code Studio' },
  '.xml':   { appId: 'code-studio',  label: 'Code Studio' },
  '.yaml':  { appId: 'code-studio',  label: 'Code Studio' },
  '.yml':   { appId: 'code-studio',  label: 'Code Studio' },
  '.toml':  { appId: 'code-studio',  label: 'Code Studio' },
  '.csv':   { appId: 'code-studio',  label: 'Code Studio' },
  '.log':   { appId: 'notepad',      label: 'Notes' },

  // ── Images ───────────────────────────────────────────────────────────
  '.png':   { appId: 'photos',       label: 'Gallery' },
  '.jpg':   { appId: 'photos',       label: 'Gallery' },
  '.jpeg':  { appId: 'photos',       label: 'Gallery' },
  '.gif':   { appId: 'photos',       label: 'Gallery' },
  '.webp':  { appId: 'photos',       label: 'Gallery' },
  '.svg':   { appId: 'photos',       label: 'Gallery' },
  '.bmp':   { appId: 'photos',       label: 'Gallery' },
  '.ico':   { appId: 'photos',       label: 'Gallery' },

  // ── Video ────────────────────────────────────────────────────────────
  '.mp4':   { appId: 'media-player', label: 'Media Player' },
  '.webm':  { appId: 'media-player', label: 'Media Player' },
  '.mkv':   { appId: 'media-player', label: 'Media Player' },
  '.avi':   { appId: 'media-player', label: 'Media Player' },
  '.mov':   { appId: 'media-player', label: 'Media Player' },

  // ── Audio ────────────────────────────────────────────────────────────
  '.mp3':   { appId: 'media-player', label: 'Media Player' },
  '.ogg':   { appId: 'media-player', label: 'Media Player' },
  '.wav':   { appId: 'media-player', label: 'Media Player' },
  '.flac':  { appId: 'media-player', label: 'Media Player' },
  '.m4a':   { appId: 'media-player', label: 'Media Player' },
  '.aac':   { appId: 'media-player', label: 'Media Player' },

  // ── Archives ─────────────────────────────────────────────────────────
  '.zip':   { appId: 'files',        label: 'File Explorer' },
  '.tar':   { appId: 'files',        label: 'File Explorer' },
  '.gz':    { appId: 'files',        label: 'File Explorer' },

  // ── AI Models ────────────────────────────────────────────────────────
  '.gguf':  { appId: 'ai-hub',       label: 'Cortex' },
};

/**
 * Static icon lookup for apps that appear in file-association contexts
 * (e.g. "Open with" submenu).  Keeps plain JS modules from importing the
 * React component tree just to resolve an icon.
 */
export const APP_ICON_MAP = {
  'notepad':      { iconFile: 'notes',        color: '#8b5cf6', icon: 'FileText' },
  'code-studio':  { iconFile: 'code-studio',  color: '#4ade80', icon: 'Code' },
  'browser':      { iconFile: 'browser',      color: '#06b6d4', icon: 'Globe' },
  'photos':       { iconFile: 'gallery',      color: '#f472b6', icon: 'Image' },
  'media-player': { iconFile: 'media-player', color: '#22d3ee', icon: 'Music' },
  'files':        { iconFile: 'files',        color: '#f59e0b', icon: 'Folder' },
  'ai-hub':       { iconFile: 'cortex',       color: '#06b6d4', icon: 'BrainCircuit' },
};

export function getAppIconInfo(appId) {
  return APP_ICON_MAP[appId] || null;
}

/** Look up the default app for a file name.  Returns the association object
 *  or null if no mapping exists. */
export function getDefaultApp(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = fileName.slice(dot).toLowerCase();
  return FILE_ASSOCIATIONS[ext] || null;
}

/** Return all associations sorted alphabetically by extension. */
export function listAssociations() {
  return Object.entries(FILE_ASSOCIATIONS)
    .map(([ext, info]) => ({ ext, ...info }))
    .sort((a, b) => a.ext.localeCompare(b.ext));
}
